; ============================================================================
;  Velara Print Bridge — instalador Windows
;
;  Substitui os .bat: o cliente da dois cliques e responde duas perguntas.
;  Instala o servico via NSSM (embutido, sem depender de internet), grava o
;  .env e sobe o servico. Desinstala pelo "Adicionar ou remover programas".
;
;  Compilar:  ISCC VelaraPrintBridge.iss  (ou build.sh, que usa Docker)
; ============================================================================

#define AppName        "Velara Print Bridge"
; A versao e UMA so, a do package.json, injetada pelo build (/dAppVersion=...).
; Antes conviviam tres numeros diferentes (server.js 1.5.0, package.json 1.1.0,
; este arquivo 1.4.1) e ninguem sabia o que rodava no cliente.
#ifndef AppVersion
  #define AppVersion   "0.0.0-dev"
#endif
#define AppPublisher   "Velara"
#define AppURL         "https://pdv.velaraia.app"
#define ServiceName    "VelaraPrintBridge"
#define ExeName        "velara-print-bridge.exe"
#define TrayName       "velara-tray.exe"
#define SupabaseUrl    "https://frbziqazwhymwsrtneoy.supabase.co"

[Setup]
AppId={{8F3A6C21-9D4E-4B7A-A1C3-5E2F7B9D0A64}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
DefaultDirName={autopf}\Velara\PrintBridge
DefaultGroupName=Velara
DisableProgramGroupPage=yes
DisableDirPage=no
; Fica dentro do diretorio montado no container; o build.sh move para dist-installer.
OutputDir=output
OutputBaseFilename=VelaraPrintBridgeSetup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=assets\velara.ico
WizardImageFile=assets\wizard-large.bmp
WizardSmallImageFile=assets\wizard-small.bmp
UninstallDisplayIcon={app}\{#ExeName}
UninstallDisplayName={#AppName}
; O servico precisa ser instalado com privilegio administrativo. Pedir aqui
; evita o "clique com o botao direito e execute como administrador" que o
; cliente esquecia no .bat.
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "payload\{#ExeName}";  DestDir: "{app}"; Flags: ignoreversion
Source: "payload\nssm.exe";    DestDir: "{app}"; Flags: ignoreversion
Source: "payload\{#TrayName}"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
; Icone da bandeja para QUALQUER usuario que logar. Num PC de caixa cada turno
; costuma usar um login diferente; registrar so no usuario que instalou faria
; o icone sumir na troca de turno.
Root: HKLM; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "VelaraPrintBridgeTray"; \
  ValueData: """{app}\{#TrayName}"""; Flags: uninsdeletevalue

[Icons]
Name: "{group}\Painel do Velara PDV";      Filename: "{#AppURL}"
Name: "{group}\Painel de impressao";       Filename: "http://localhost:{code:GetPort}/"
Name: "{group}\Desinstalar {#AppName}";    Filename: "{uninstallexe}"

[Run]
; O registro do servico NAO fica aqui de proposito. As entradas [Run] rodam
; numa ordem que nao da para intercalar com a escrita do .env — e o servico
; sem .env sobe, falha e morre. Tudo isso vive em ConfiguraServico(), no
; [Code], onde a sequencia e explicita.
Filename: "{app}\{#TrayName}"; Description: "Iniciar o icone de monitoramento"; Flags: postinstall nowait skipifsilent runasoriginaluser
Filename: "http://localhost:{code:GetPort}/"; Description: "Abrir o painel de impressao"; Flags: postinstall shellexec nowait

[UninstallRun]
Filename: "{app}\nssm.exe"; Parameters: "stop {#ServiceName}"; Flags: runhidden; RunOnceId: "StopSvc"
Filename: "{app}\nssm.exe"; Parameters: "remove {#ServiceName} confirm"; Flags: runhidden; RunOnceId: "RemoveSvc"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"
Type: files; Name: "{app}\.env"

[Code]
var
  PageDados: TInputQueryWizardPage;

procedure InitializeWizard();
begin
  PageDados := CreateInputQueryPage(wpSelectDir,
    'Dados do restaurante',
    'Identifique este estabelecimento',
    'Estes dados vem da Velara. O codigo do restaurante e o que garante que ' +
    'estas impressoras recebam apenas os pedidos deste estabelecimento.');

  PageDados.Add('Nome do restaurante:', False);
  PageDados.Add('Codigo do restaurante:', False);
  PageDados.Add('Porta local (deixe 7777 se nao souber):', False);

  PageDados.Values[2] := '7777';
end;

function GetPort(Param: string): string;
begin
  Result := PageDados.Values[2];
  if Result = '' then
    Result := '7777';
end;

{ Valida um UUID no formato 8-4-4-4-12. Digitar o codigo errado e o erro mais
  caro possivel aqui: a bridge sobe, fica muda, e ninguem descobre ate faltar
  cupom na cozinha. }
function UuidValido(const S: string): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := False;
  if Length(S) <> 36 then Exit;
  for I := 1 to 36 do
  begin
    C := S[I];
    if (I = 9) or (I = 14) or (I = 19) or (I = 24) then
    begin
      if C <> '-' then Exit;
    end
    else if not (((C >= '0') and (C <= '9')) or
                 ((C >= 'a') and (C <= 'f')) or
                 ((C >= 'A') and (C <= 'F'))) then Exit;
  end;
  Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Porta: Integer;
begin
  Result := True;
  if CurPageID = PageDados.ID then
  begin
    if Trim(PageDados.Values[0]) = '' then
    begin
      MsgBox('Informe o nome do restaurante.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if not UuidValido(Trim(PageDados.Values[1])) then
    begin
      MsgBox('O codigo do restaurante parece invalido.' + #13#10#13#10 +
             'Ele tem 36 caracteres, no formato:' + #13#10 +
             '3dea3260-e304-43d4-8ab0-4e9a9006a097' + #13#10#13#10 +
             'Confira com a Velara antes de continuar.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    Porta := StrToIntDef(Trim(PageDados.Values[2]), 0);
    if (Porta < 1024) or (Porta > 65535) then
    begin
      MsgBox('A porta local deve ser um numero entre 1024 e 65535.' + #13#10 +
             'Se nao souber, use 7777.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

{ Para o servico ANTES da copia dos arquivos. Se ele estiver rodando, o Windows
  mantem um lock no .exe e a instalacao morre em "DeleteFile failed; code 5". }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Rc, I: Integer;
begin
  Result := '';
  NeedsRestart := False;

  { nssm.exe da instalacao anterior, quando existe, para com mais elegancia. }
  if FileExists(ExpandConstant('{app}\nssm.exe')) then
    Exec(ExpandConstant('{app}\nssm.exe'), 'stop {#ServiceName}', '', SW_HIDE,
         ewWaitUntilTerminated, Rc);

  Exec(ExpandConstant('{sys}\sc.exe'), 'stop {#ServiceName}', '', SW_HIDE,
       ewWaitUntilTerminated, Rc);

  { sc.exe volta assim que pede a parada, nao quando o processo morre de fato.
    Sem esta espera o lock ainda esta de pe quando a copia comeca. }
  for I := 1 to 10 do
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'query {#ServiceName}', '', SW_HIDE,
         ewWaitUntilTerminated, Rc);
    if Rc <> 0 then Break;  { servico nao existe mais }
    Sleep(500);
  end;

  { Garantia final: se o processo sobreviveu ao stop, derruba. }
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#ExeName}', '', SW_HIDE,
       ewWaitUntilTerminated, Rc);

  { O icone da bandeja tambem segura o proprio .exe enquanto roda. }
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#TrayName}', '', SW_HIDE,
       ewWaitUntilTerminated, Rc);
  Sleep(500);
end;

function Nssm(const Args: string): Integer;
begin
  Exec(ExpandConstant('{app}\nssm.exe'), Args, '', SW_HIDE,
       ewWaitUntilTerminated, Result);
end;

{ Remove instalacao anterior — inclusive a feita pelos .bat antigos, que
  registravam o servico com o mesmo nome. Sem isso o NSSM recusa o install. }
procedure RemoveServicoAnterior();
var
  Rc: Integer;
begin
  Nssm('stop {#ServiceName}');
  Nssm('remove {#ServiceName} confirm');
  { Fallback: se a instalacao velha nao tinha nssm, o servico ainda existe. }
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop {#ServiceName}', '', SW_HIDE,
       ewWaitUntilTerminated, Rc);
  Exec(ExpandConstant('{sys}\sc.exe'), 'delete {#ServiceName}', '', SW_HIDE,
       ewWaitUntilTerminated, Rc);
end;

procedure EscreveEnv();
var
  Env: TStringList;
begin
  Env := TStringList.Create;
  try
    { A chave anon e publica por definicao — ela ja viaja no bundle do
      navegador em pdv.velaraia.app. Embutir aqui nao expoe nada novo. }
    Env.Add('SUPABASE_URL={#SupabaseUrl}');
    Env.Add('SUPABASE_ANON_KEY={#SupabaseAnonKey}');
    Env.Add('ESTABLISHMENT_NAME=' + Trim(PageDados.Values[0]));
    Env.Add('TENANT_USER_ID=' + Trim(PageDados.Values[1]));
    Env.Add('BRIDGE_HTTP_PORT=' + Trim(PageDados.Values[2]));
    Env.SaveToFile(ExpandConstant('{app}\.env'));
  finally
    Env.Free;
  end;
end;

{ Ordem importa e por isso e explicita: limpar -> .env -> registrar -> subir.
  O servico le o .env no boot; se ele subir antes, morre na primeira linha. }
procedure ConfiguraServico();
var
  Rc, I: Integer;
begin
  RemoveServicoAnterior();

  ForceDirectories(ExpandConstant('{app}\logs'));
  EscreveEnv();

  Nssm('install {#ServiceName} "' + ExpandConstant('{app}\{#ExeName}') + '"');
  Nssm('set {#ServiceName} AppDirectory "' + ExpandConstant('{app}') + '"');
  Nssm('set {#ServiceName} DisplayName "{#AppName}"');
  Nssm('set {#ServiceName} Description "Servico de impressao termica ESC/POS para o PDV Velara"');
  Nssm('set {#ServiceName} Start SERVICE_AUTO_START');
  Nssm('set {#ServiceName} AppRestartDelay 5000');
  Nssm('set {#ServiceName} AppStdout "' + ExpandConstant('{app}\logs\output.log') + '"');
  Nssm('set {#ServiceName} AppStderr "' + ExpandConstant('{app}\logs\error.log') + '"');
  Nssm('set {#ServiceName} AppRotateFiles 1');
  Nssm('set {#ServiceName} AppRotateBytes 5242880');
  Nssm('set {#ServiceName} AppRotateOnline 1');

  { Recuperacao: o servico tem de voltar sozinho. AppExit/AppThrottle cobrem o
    processo que morre; o sc failure cobre o caso de ele ser morto de fora
    (antivirus, desligamento sujo), que o NSSM sozinho nao pega. }
  Nssm('set {#ServiceName} AppExit Default Restart');
  Nssm('set {#ServiceName} AppThrottle 10000');
  Nssm('set {#ServiceName} AppStopMethodConsole 5000');
  Nssm('set {#ServiceName} AppNoConsole 1');
  Exec(ExpandConstant('{cmd}'),
       '/C sc failure {#ServiceName} reset= 86400 actions= restart/5000/restart/10000/restart/30000'
       + ' && sc failureflag {#ServiceName} 1',
       '', SW_HIDE, ewWaitUntilTerminated, Rc);

  Nssm('start {#ServiceName}');

  { O nssm devolve erro se o servico demora a responder, mesmo tendo subido —
    foi o que aconteceu no KOTEN: alarme de falha com o servico rodando. Entao
    perguntamos ao Windows, e damos tempo para o boot (Realtime + Supabase). }
  Rc := 1;
  for I := 1 to 12 do
  begin
    Sleep(1000);
    Exec(ExpandConstant('{cmd}'),
         '/C sc query {#ServiceName} | find "RUNNING"',
         '', SW_HIDE, ewWaitUntilTerminated, Rc);
    if Rc = 0 then Break;
  end;

  if Rc <> 0 then
    MsgBox('O servico foi instalado, mas nao iniciou de primeira.' + #13#10#13#10 +
           'Abra services.msc e inicie "{#AppName}" manualmente.' + #13#10 +
           'Se falhar, veja o log em:' + #13#10 +
           ExpandConstant('{app}\logs\error.log'), mbInformation, MB_OK);
end;

{ Diagnostico apos a instalacao.

  Ate aqui o assistente aceitava um codigo de estabelecimento com formato
  valido mas inexistente, e a bridge subia muda: ninguem descobria que estava
  errado ate faltar cupom na cozinha. Agora perguntamos ao proprio servico o
  que ele conseguiu enxergar — servidor, estabelecimento, impressoras
  cadastradas e relogio — e mostramos na tela, em portugues. }
function LeSelfTest(): String;
var
  Http: Variant;
  I: Integer;
begin
  Result := '';
  for I := 1 to 10 do
  begin
    try
      Http := CreateOleObject('WinHttp.WinHttpRequest.5.1');
      Http.Open('GET', 'http://localhost:' + PageDados.Values[2] + '/selftest?formato=texto', False);
      Http.SetTimeouts(3000, 5000, 5000, 40000);
      Http.Send('');
      if Http.Status = 200 then
      begin
        Result := Http.ResponseText;
        Exit;
      end;
    except
      { servico ainda subindo }
    end;
    Sleep(2000);
  end;
end;

procedure MostraDiagnostico();
var
  Texto: String;
begin
  Texto := LeSelfTest();
  if Texto = '' then
  begin
    MsgBox('O servico foi instalado, mas nao respondeu ao teste de diagnostico.' + #13#10#13#10 +
           'Abra o painel em http://localhost:' + PageDados.Values[2] + '/ para conferir.',
           mbInformation, MB_OK);
    Exit;
  end;

  if Pos('FALHA', Texto) > 0 then
    MsgBox('Diagnostico da instalacao:' + #13#10#13#10 + Texto + #13#10 +
           'Ha itens com FALHA. Confira o codigo do estabelecimento e a internet do local.',
           mbError, MB_OK)
  else
    MsgBox('Diagnostico da instalacao:' + #13#10#13#10 + Texto, mbInformation, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    ConfiguraServico();
    MostraDiagnostico();
  end;
end;
