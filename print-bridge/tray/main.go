// Velara Print Bridge — ícone da bandeja do Windows.
//
// Fica ao lado do relógio, muda de cor conforme a saúde da impressão e abre o
// painel numa janela limpa. Existe porque falha de impressora é silenciosa: no
// KOTEN uma impressora caiu e ninguém percebeu por dois dias.
//
// Não é o serviço. O serviço (velara-print-bridge.exe) roda separado e continua
// imprimindo mesmo que ninguém abra este ícone.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/getlantern/systray"
)

const (
	portaPadrao = "7777"
	intervalo   = 20 * time.Second
)

// porta é lida do .env ao lado do executável. Ficava fixa em 7777, então quem
// escolhesse outra porta no instalador terminava com o ícone permanentemente
// vermelho — o serviço imprimindo e o ícone dizendo que estava parado.
var porta = descobrirPorta()

func descobrirPorta() string {
	exe, err := os.Executable()
	if err != nil {
		return portaPadrao
	}
	dados, err := os.ReadFile(filepath.Join(filepath.Dir(exe), ".env"))
	if err != nil {
		return portaPadrao
	}
	for _, linha := range strings.Split(string(dados), "\n") {
		linha = strings.TrimSpace(linha)
		if valor, ok := strings.CutPrefix(linha, "BRIDGE_HTTP_PORT="); ok {
			valor = strings.Trim(strings.TrimSpace(valor), `"'`)
			if valor != "" {
				return valor
			}
		}
	}
	return portaPadrao
}

type impressora struct {
	Target           string   `json:"target"`
	Centers          []string `json:"centers"`
	Online           *bool    `json:"online"`
	LastError        string   `json:"last_error"`
	QuarantinedUntil string   `json:"quarantined_until"`
}

type status struct {
	Version       string `json:"version"`
	Establishment string `json:"establishment"`
	Connected     bool   `json:"connected"`
	// Healthy = trabalhou ou conferiu a fila do banco agora há pouco. Vem da
	// versão 2 da ponte; nas anteriores fica false e caímos em Connected.
	Healthy    *bool        `json:"healthy"`
	RealtimeOk *bool        `json:"realtime_ok"`
	Pending    int          `json:"pending_jobs_count"`
	Printers   []impressora `json:"printers"`
}

var (
	itemEstado  *systray.MenuItem
	itemAbrir   *systray.MenuItem
	itemSair    *systray.MenuItem
	ultimoAviso string
)

func main() {
	systray.Run(aoIniciar, func() {})
}

func aoIniciar() {
	systray.SetIcon(iconeCinza)
	systray.SetTitle("Velara")
	systray.SetTooltip("Velara — verificando impressao...")

	itemEstado = systray.AddMenuItem("Verificando...", "")
	itemEstado.Disable()
	systray.AddSeparator()
	itemAbrir = systray.AddMenuItem("Abrir painel", "Ver o status das impressoras")
	systray.AddSeparator()
	itemSair = systray.AddMenuItem("Fechar", "Fecha o icone (o servico continua imprimindo)")

	go monitorar()

	for {
		select {
		case <-itemAbrir.ClickedCh:
			abrirPainel()
		case <-itemSair.ClickedCh:
			systray.Quit()
			return
		}
	}
}

func monitorar() {
	for {
		s, err := buscarStatus()
		atualizar(s, err)
		time.Sleep(intervalo)
	}
}

func buscarStatus() (*status, error) {
	cliente := http.Client{Timeout: 4 * time.Second}
	resp, err := cliente.Get("http://localhost:" + porta + "/status")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var s status
	if err := json.NewDecoder(resp.Body).Decode(&s); err != nil {
		return nil, err
	}
	return &s, nil
}

func atualizar(s *status, err error) {
	// Serviço fora do ar é o pior caso: nada imprime e ninguém avisa.
	if err != nil || s == nil {
		systray.SetIcon(iconeVermelho)
		systray.SetTooltip("Velara — SERVICO PARADO\nNenhum pedido sera impresso")
		itemEstado.SetTitle("Servico parado")
		notificar("serviço parado", "Impressao parada", "O servico da Velara nao esta rodando. Nenhum pedido sera impresso.")
		return
	}

	var fora []string
	for _, p := range s.Printers {
		if p.Online != nil && !*p.Online {
			nome := p.Target
			if len(p.Centers) > 0 {
				nome = p.Centers[0]
			}
			fora = append(fora, nome)
		}
	}

	// Saudável = imprimiu ou conferiu a fila há pouco. A versão 1.x não
	// reportava isso e pintava de verde só porque o socket dizia estar
	// inscrito — foi assim que uma queda inteira passou despercebida.
	saudavel := s.Connected
	if s.Healthy != nil {
		saudavel = *s.Healthy
	}
	// Sem Realtime a impressão continua saindo pelo reconciliador, só que com
	// até 20s de atraso. Isso é amarelo, não vermelho: chamar de "parado" o que
	// está funcionando ensina o dono a ignorar o ícone.
	semRealtime := s.RealtimeOk != nil && !*s.RealtimeOk

	switch {
	case !saudavel:
		systray.SetIcon(iconeVermelho)
		systray.SetTooltip("Velara — sem conexao com o servidor")
		itemEstado.SetTitle("Sem conexao")
		notificar("sem conexao", "Sem conexao", "A impressao perdeu contato com o servidor da Velara.")

	case len(fora) > 0:
		systray.SetIcon(iconeVermelho)
		lista := ""
		for i, n := range fora {
			if i > 0 {
				lista += ", "
			}
			lista += n
		}
		systray.SetTooltip("Velara — impressora fora: " + lista)
		itemEstado.SetTitle("Fora do ar: " + lista)
		notificar("fora:"+lista, "Impressora sem resposta", lista+" nao esta respondendo. Verifique cabo, energia e papel.")

	case semRealtime:
		// Estado intermediário que não existia: imprimindo, porém pela rede de
		// segurança. Vale avisar sem alarmar.
		systray.SetIcon(iconeCinza)
		systray.SetTooltip("Velara — imprimindo em modo lento\nO aviso instantaneo caiu; os pedidos saem em ate 20s")
		itemEstado.SetTitle("Imprimindo (modo lento)")

	default:
		systray.SetIcon(iconeVerde)
		fila := ""
		if s.Pending > 0 {
			fila = fmt.Sprintf("\n%d na fila", s.Pending)
		}
		systray.SetTooltip("Velara — tudo certo" + fila)
		itemEstado.SetTitle("Tudo certo")
		ultimoAviso = "" // volta a avisar se cair de novo
	}
}

// notificar mostra o balão só quando o problema MUDA. Repetir o mesmo aviso a
// cada 20s treina o usuário a ignorar, que é o oposto do objetivo.
func notificar(chave, titulo, corpo string) {
	if ultimoAviso == chave {
		return
	}
	ultimoAviso = chave
	// PowerShell é o caminho sem dependência para balão nativo no Windows.
	ps := fmt.Sprintf(`
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
$t=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$x=$t.GetXml(); $n=$t.GetElementsByTagName("text")
$n.Item(0).AppendChild($t.CreateTextNode("%s")) | Out-Null
$n.Item(1).AppendChild($t.CreateTextNode("%s")) | Out-Null
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Velara").Show([Windows.UI.Notifications.ToastNotification]::new($t))
`, titulo, corpo)
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps)
	_ = cmd.Start()
}

// abrirPainel usa o Edge em modo aplicativo: janela limpa, sem barra de
// endereço nem abas. Parece programa nativo sem empacotar um navegador junto.
func abrirPainel() {
	url := "http://localhost:" + porta + "/"
	candidatos := []string{
		os.Getenv("ProgramFiles(x86)") + `\Microsoft\Edge\Application\msedge.exe`,
		os.Getenv("ProgramFiles") + `\Microsoft\Edge\Application\msedge.exe`,
	}
	for _, exe := range candidatos {
		if _, err := os.Stat(exe); err == nil {
			c := exec.Command(exe, "--app="+url, "--window-size=520,760")
			if err := c.Start(); err == nil {
				return
			}
		}
	}
	// Sem Edge, abre no navegador padrão.
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
