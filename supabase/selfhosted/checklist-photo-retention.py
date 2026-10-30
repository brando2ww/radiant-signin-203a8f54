#!/usr/bin/env python3
"""Retém fotos de checklist por 30 dias, só nas lojas informadas. Arquiva antes de remover.

Executar no host do Supabase. Sem --apply, apenas informa volume. O arquivo privado
preserva os bytes e metadados para recuperação; respostas de checklist não são apagadas.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request
import uuid


def sql(query):
    return subprocess.check_output([
        'docker', 'exec', '-i', 'velara-pdv-db', 'psql', '-U', 'postgres', '-d', 'postgres',
        '-At', '-v', 'ON_ERROR_STOP=1',
    ], input=query.encode()).decode().strip()


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner', action='append', required=True)
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--limit', type=int, default=500)
    parser.add_argument('--archive', default='/root/velara-checklist-photo-archive')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.days < 30 or not 1 <= args.limit <= 5000:
        parser.error('Retenção mínima de 30 dias; limite entre 1 e 5000.')
    owners = ','.join("'%s'" % uuid.UUID(owner) for owner in args.owner)
    archive = Path(args.archive)
    archive.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(archive, 0o700)
    with (archive / 'run.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Já existe uma limpeza em andamento.'); return
        # Também considera updated_at: uma foto antiga substituída recentemente não expira.
        raw = sql(f"""select coalesce(json_agg(s),'[]') from (
          select o.id,o.name,o.version,o.metadata,o.created_at,o.updated_at
          from storage.objects o where o.bucket_id='checklist-evidence'
            and split_part(o.name,'/',1) in ({owners})
            and greatest(o.created_at,o.updated_at)<now()-interval '{args.days} days'
          order by o.created_at limit {args.limit}) s;""")
        objects = json.loads(raw)
        summary = {'candidates': len(objects), 'bytes': sum(int((o['metadata'] or {}).get('size', 0)) for o in objects), 'removed': 0, 'missing': 0, 'skipped': 0}
        if not args.apply:
            print(json.dumps(summary)); return
        runtime = json.loads(subprocess.check_output(['docker', 'inspect', 'velara-pdv-functions']))[0]
        env = dict(value.split('=', 1) for value in runtime['Config']['Env'] if '=' in value)
        key = env['SUPABASE_SERVICE_ROLE_KEY']
        storage = json.loads(subprocess.check_output(['docker', 'inspect', 'velara-pdv-storage']))[0]
        volume = next(m['Source'] for m in storage['Mounts'] if m['Destination'] == '/var/lib/storage')
        roots = list(Path(volume).glob('*/*/checklist-evidence'))
        if len(roots) != 1: raise RuntimeError('Raiz do bucket não identificada com segurança')
        root = roots[0]
        pattern = r'[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-zA-Z0-9]+'
        def mark_expired(names):
            if not names: return
            rows = ','.join("('%s'::uuid,'%s'::uuid,'%s')" % (*name.split('/')[:2], name) for name in names)
            sql(f"""update checklist_execution_items i set photo_url=null,photo_expired_at=now()
              from (values {rows}) v(owner_id,execution_id,name),checklist_executions e
              where e.id=i.execution_id and e.user_id=v.owner_id and e.id=v.execution_id
              and split_part(i.photo_url,'?',1) like '%/checklist-evidence/'||v.name
              and not exists(select 1 from storage.objects o where o.bucket_id='checklist-evidence' and o.name=v.name);""")
        # Reconcilia uma execução anterior interrompida depois da exclusão no Storage.
        archived = []
        for metadata in (archive / 'objects').glob('*/*/*/metadata.json'):
            name = metadata.parent.relative_to(archive / 'objects').as_posix()
            if re.fullmatch(pattern, name) and name.split('/')[0] in args.owner: archived.append(name)
        for offset in range(0, len(archived), 100): mark_expired(archived[offset:offset+100])
        for offset in range(0, len(objects), 100):
            batch = objects[offset:offset+100]
            ids = ','.join("'%s'" % uuid.UUID(obj['id']) for obj in batch)
            valid = json.loads(sql(f"""select coalesce(json_object_agg(o.id,o.version),'{{}}')
              from storage.objects o where o.id in ({ids}) and exists(
                select 1 from checklist_executions e where e.id::text=split_part(o.name,'/',2)
                  and e.user_id::text=split_part(o.name,'/',1));"""))
            ready = []
            for obj in batch:
                name = obj['name']
                if not re.fullmatch(pattern, name) or valid.get(obj['id']) != obj['version']:
                    summary['skipped'] += 1; continue
                source = root / name
                if not source.is_dir() or not any(source.iterdir()):
                    summary['missing'] += 1; continue
                target = archive / 'objects' / name
                def copy_link(src, dst):
                    try: os.link(src, dst)
                    except FileExistsError: pass
                    except OSError: shutil.copy2(src, dst)
                shutil.copytree(source, target, copy_function=copy_link, dirs_exist_ok=True)
                (target / 'metadata.json').write_text(json.dumps(obj))
                ready.append(obj)
            if not ready: continue
            ids = ','.join("'%s'" % uuid.UUID(obj['id']) for obj in ready)
            current = json.loads(sql(f"select coalesce(json_object_agg(id,version),'{{}}') from storage.objects where id in ({ids});"))
            names = [obj['name'] for obj in ready if current.get(obj['id']) == obj['version']]
            if not names: continue
            request = urllib.request.Request(
                'https://velara-pdv.db.venzorgroup.com.br/storage/v1/object/checklist-evidence',
                data=json.dumps({'prefixes': names}).encode(), method='DELETE',
                headers={'Authorization': 'Bearer '+key, 'apikey': key, 'Content-Type': 'application/json'},
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200: raise RuntimeError('Storage não confirmou a remoção')
            mark_expired(names)
            summary['removed'] += len(names)
            print(json.dumps({'progress': summary['removed'], 'candidates': len(objects)}), flush=True)
        summary['finished_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
        with (archive / 'runs.jsonl').open('a') as log: log.write(json.dumps(summary)+'\n')
        print(json.dumps(summary))


if __name__ == '__main__': run()
