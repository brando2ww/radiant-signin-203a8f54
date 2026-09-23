package app.velara.pos

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Terminal de cobrança do Velara na maquininha Getnet.
 *
 * O caixa manda o valor pelo sistema, este app pega da fila, abre a aplicação
 * de Pagamento da Getnet e devolve NSU, autorização e bandeira para o pedido.
 * Ninguém digita valor na maquininha.
 */
class MainActivity : AppCompatActivity() {

    private companion object {
        const val CICLO_MS = 3000L
        const val BATIMENTO_MS = 30000L
        const val PREFS = "velara"
    }

    private lateinit var pontoConexao: View
    private lateinit var textoConexao: TextView
    private lateinit var identificacao: TextView
    private lateinit var faixa: View
    private lateinit var rotulo: TextView
    private lateinit var valorTxt: TextView
    private lateinit var detalhe: TextView
    private lateinit var progresso: ProgressBar
    private lateinit var lista: LinearLayout
    private lateinit var vazio: TextView
    private lateinit var rodape: TextView

    private val relogio = Handler(Looper.getMainLooper())
    private var ocupado = false
    private var pedidoAtual: Fila.Pedido? = null
    private var nomeLoja: String? = null

    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private val estabelecimento get() = prefs.getString("estabelecimento", "")!!.trim()
    private val nomeTerminal get() = prefs.getString("nome", "")!!.ifBlank { "Terminal" }
    private val idTerminal: String
        get() = prefs.getString("terminal", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("terminal", it).apply()
        }

    // ── ciclo de vida ────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // A maquininha fica na mão do operador: a tela não pode apagar no meio.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        pontoConexao = findViewById(R.id.pontoConexao)
        textoConexao = findViewById(R.id.textoConexao)
        identificacao = findViewById(R.id.identificacao)
        faixa = findViewById(R.id.faixa)
        rotulo = findViewById(R.id.rotulo)
        valorTxt = findViewById(R.id.valor)
        detalhe = findViewById(R.id.detalhe)
        progresso = findViewById(R.id.progresso)
        lista = findViewById(R.id.lista)
        vazio = findViewById(R.id.vazio)
        rodape = findViewById(R.id.rodape)

        findViewById<Button>(R.id.botaoConfig).setOnClickListener { abrirAjustes() }
        findViewById<Button>(R.id.botaoTestar).setOnClickListener { testarMaquininha() }
        findViewById<Button>(R.id.botaoReimprimir).setOnClickListener { reimprimir() }

        rodape.text = "Velara PDV ${BuildConfig.VERSION_NAME} · terminal ${idTerminal.take(8)}"
        nomeLoja = prefs.getString("nome_loja", null)
        mostrarPronto()
        atualizarCabecalho()

        if (estabelecimento.isBlank()) abrirAjustes() else { apresentar(); carregarLista() }
    }

    override fun onResume() {
        super.onResume()
        relogio.removeCallbacks(ciclo)
        relogio.removeCallbacks(batimento)
        relogio.post(ciclo)
        relogio.postDelayed(batimento, BATIMENTO_MS)
    }

    override fun onPause() {
        super.onPause()
        relogio.removeCallbacks(ciclo)
        relogio.removeCallbacks(batimento)
    }

    // ── laços ────────────────────────────────────────────────────────────────

    private val ciclo = object : Runnable {
        override fun run() {
            atualizarConexao()
            if (!ocupado && estabelecimento.isNotBlank()) buscar()
            relogio.postDelayed(this, CICLO_MS)
        }
    }

    private val batimento = object : Runnable {
        override fun run() {
            if (estabelecimento.isNotBlank()) {
                apresentar()
                carregarLista()
            }
            relogio.postDelayed(this, BATIMENTO_MS)
        }
    }

    /** Diz ao Velara que este terminal está de pé e confirma de quem ele é. */
    private fun apresentar() {
        val info = JSONObject()
            .put("app_version", BuildConfig.VERSION_NAME)
            .put("serial", prefs.getString("serie", null) ?: JSONObject.NULL)
            .put("logic_number", prefs.getString("numlogic", null) ?: JSONObject.NULL)
        Thread {
            val id = Fila.registrar(estabelecimento, idTerminal, nomeTerminal, info)
            runOnUiThread {
                if (id.ok && id.estabelecimento != null) {
                    nomeLoja = id.estabelecimento
                    prefs.edit().putString("nome_loja", id.estabelecimento).apply()
                    atualizarCabecalho()
                    if (!id.tefAtivo) {
                        detalhe.text = "A cobrança na maquininha ainda está desligada no Velara, em Integrações, Getnet."
                    }
                }
            }
        }.start()
    }

    private fun buscar() {
        ocupado = true
        Thread {
            val pedido = Fila.reivindicar(estabelecimento, idTerminal)
            runOnUiThread { if (pedido == null) ocupado = false else executar(pedido) }
        }.start()
    }

    // ── execução ─────────────────────────────────────────────────────────────

    private fun executar(pedido: Fila.Pedido) {
        pedidoAtual = pedido
        when (pedido.operacao) {
            "teste" -> {
                mostrarEstado("TESTE DO CAIXA", "Tudo certo", "O caixa falou com esta maquininha.", "#059669")
                concluir(pedido.id, "approved", JSONObject().put("mensagem", "Terminal respondendo"), null)
            }
            "reimpressao" -> {
                concluir(pedido.id, "approved", JSONObject().put("mensagem", "Reimpressão disparada"), null)
                abrir(Getnet.reimpressao(), Getnet.REIMPRESSAO)
            }
            "cancelamento" -> estornar(pedido)
            "venda" -> cobrar(pedido)
            else -> concluir(pedido.id, "error", null, "Operação ${pedido.operacao} não é feita por este terminal")
        }
    }

    private fun cobrar(pedido: Fila.Pedido) {
        mostrarEstado("COBRANDO", emReais(pedido.valor), "Aproxime, insira ou passe o cartão.", "#111827", carregando = true)
        abrir(Getnet.pagamento(pedido.valor, pedido.tipo, pedido.parcelas, pedido.financiamento), Getnet.PAGAMENTO) {
            concluir(pedido.id, "error", null, "Aplicação de Pagamento da Getnet não encontrada neste terminal")
        }
    }

    private fun estornar(pedido: Fila.Pedido) {
        val original = pedido.pedidoOriginal
        if (original.isNullOrBlank()) {
            concluir(pedido.id, "error", null, "Cancelamento sem a venda de origem")
            return
        }
        mostrarEstado("CANCELANDO", emReais(pedido.valor), "Buscando a venda original...", "#B45309", carregando = true)
        Thread {
            val venda = Fila.vendaOriginal(estabelecimento, original)
            runOnUiThread {
                if (venda == null) {
                    concluir(pedido.id, "error", null, "Venda original não encontrada ou não aprovada")
                    mostrarPronto()
                    return@runOnUiThread
                }
                val quando = venda.optString("quando", null)
                val data = quando?.let {
                    try {
                        val entrada = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                            timeZone = TimeZone.getTimeZone("UTC")
                        }.parse(it.take(19))
                        SimpleDateFormat("dd/MM/yyyy", Locale.US).format(entrada!!)
                    } catch (e: Exception) { null }
                }
                mostrarEstado("CANCELANDO", emReais(pedido.valor), "Confirme o cancelamento na maquininha.", "#B45309", carregando = true)
                abrir(
                    Getnet.estorno(
                        valor = if (pedido.valor > 0) pedido.valor else venda.optDouble("valor", 0.0),
                        dataTransacao = data,
                        cv = venda.optString("cv", null),
                        terminalOrigem = venda.optString("terminal_origem", null),
                    ),
                    Getnet.ESTORNO,
                ) { concluir(pedido.id, "error", null, "Aplicação de Pagamento da Getnet não encontrada") }
            }
        }.start()
    }

    private fun abrir(intencao: Intent, codigo: Int, aoFalhar: (() -> Unit)? = null) {
        try {
            startActivityForResult(intencao, codigo)
        } catch (e: Exception) {
            aoFalhar?.invoke()
            mostrarEstado("SEM O APP DE PAGAMENTO", "Não deu", "A aplicação de Pagamento da Getnet não respondeu neste terminal.", "#DC2626")
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val extras = data?.extras
        when (requestCode) {
            Getnet.INFO -> guardarInformacoes(extras)
            Getnet.REIMPRESSAO -> mostrarPronto()
            Getnet.PAGAMENTO, Getnet.ESTORNO -> concluirTransacao(extras, requestCode == Getnet.ESTORNO)
        }
    }

    private fun concluirTransacao(extras: Bundle?, ehEstorno: Boolean) {
        val pedido = pedidoAtual ?: return
        if (extras == null) {
            concluir(pedido.id, "cancelled", null, "Encerrado na maquininha")
            mostrarEstado(if (ehEstorno) "CANCELAMENTO" else "COBRANÇA", "Encerrada", "Nada foi cobrado.", "#DC2626")
            return
        }

        val status = Getnet.statusDe(extras.getString("result"))
        val motivo = extras.getString("resultDetails")
        val bandeira = extras.getString("brand")
        val nsu = extras.getString("nsu")
        val autorizacao = extras.getString("authorizationCode")
        val finalCartao = extras.getString("cardLastDigits")
        val modalidade = Getnet.modalidadeLegivel(extras.getString("type"))
        val entrada = Getnet.formaDeEntrada(extras.getString("inputType"))

        val resultado = JSONObject()
            .put("nsu", nsu ?: JSONObject.NULL)
            .put("autorizacao", autorizacao ?: JSONObject.NULL)
            .put("bandeira", bandeira ?: JSONObject.NULL)
            .put("cartao_final", finalCartao ?: JSONObject.NULL)
            .put("modalidade", modalidade)
            .put("parcelas", extras.getString("installments")?.toIntOrNull() ?: pedido.parcelas)
            .put("cv", extras.getString("cvNumber") ?: JSONObject.NULL)
            .put("nsu_local", extras.getString("nsuLocal") ?: JSONObject.NULL)
            .put("entrada", entrada)
            .put("portador", extras.getString("cardholderName") ?: JSONObject.NULL)
            .put("numero_logico", prefs.getString("numlogic", null) ?: JSONObject.NULL)
            .put("terminal", nomeTerminal)

        concluir(pedido.id, status, resultado, if (status == "approved") null else (motivo ?: "Transação não aprovada"))

        if (status == "approved") {
            val partes = listOfNotNull(
                bandeira?.takeIf { it.isNotBlank() },
                finalCartao?.takeIf { it.isNotBlank() }?.let { "final $it" },
                nsu?.takeIf { it.isNotBlank() }?.let { "NSU $it" },
            ).joinToString(" · ")
            mostrarEstado(
                if (ehEstorno) "CANCELAMENTO APROVADO" else "APROVADO",
                emReais(pedido.valor),
                if (partes.isBlank()) modalidade else "$partes",
                "#059669",
            )
        } else {
            mostrarEstado(
                if (ehEstorno) "CANCELAMENTO NÃO APROVADO" else "NÃO APROVADO",
                emReais(pedido.valor),
                motivo ?: "A transação não foi concluída.",
                "#DC2626",
            )
        }
        relogio.postDelayed({ if (!ocupado) mostrarPronto() }, 12000)
    }

    private fun concluir(id: String, status: String, resultado: JSONObject?, erro: String?) {
        Thread {
            Fila.concluir(id, status, resultado, erro)
            val cobrancas = Fila.ultimas(estabelecimento, idTerminal)
            runOnUiThread {
                ocupado = false
                pedidoAtual = null
                desenharLista(cobrancas)
            }
        }.start()
    }

    // ── ações do operador ────────────────────────────────────────────────────

    private fun reimprimir() {
        abrir(Getnet.reimpressao(), Getnet.REIMPRESSAO)
    }

    private fun testarMaquininha() {
        abrir(Getnet.informacoes(), Getnet.INFO)
    }

    private fun guardarInformacoes(extras: Bundle?) {
        if (extras == null) return
        val serie = extras.getString("numserie")
        val logico = extras.getString("numlogic")
        val nome = extras.getString("nomeEC") ?: extras.getString("razaoSocialEC")
        prefs.edit()
            .putString("serie", serie)
            .putString("numlogic", logico)
            .apply()
        apresentar()
        mostrarEstado(
            "MAQUININHA RESPONDEU",
            "Tudo certo",
            listOfNotNull(
                nome?.takeIf { it.isNotBlank() },
                logico?.takeIf { it.isNotBlank() }?.let { "terminal $it" },
                serie?.takeIf { it.isNotBlank() }?.let { "série $it" },
            ).joinToString(" · "),
            "#059669",
        )
        relogio.postDelayed({ if (!ocupado) mostrarPronto() }, 10000)
    }

    // ── tela ─────────────────────────────────────────────────────────────────

    private fun mostrarPronto() {
        mostrarEstado("TERMINAL PRONTO", "Aguardando", "O valor vem do caixa da Velara.", "#111827")
    }

    private fun mostrarEstado(titulo: String, valor: String, texto: String, cor: String, carregando: Boolean = false) {
        rotulo.text = titulo
        rotulo.setTextColor(Color.parseColor(if (cor == "#111827") "#6B7280" else cor))
        valorTxt.text = valor
        valorTxt.setTextColor(Color.parseColor(cor))
        detalhe.text = texto
        faixa.setBackgroundColor(Color.parseColor(if (cor == "#111827") "#F5C400" else cor))
        progresso.visibility = if (carregando) View.VISIBLE else View.GONE
    }

    private fun atualizarCabecalho() {
        identificacao.text = when {
            estabelecimento.isBlank() -> "Terminal não configurado"
            nomeLoja != null -> "${nomeLoja} · ${nomeTerminal}"
            else -> nomeTerminal
        }
    }

    private fun atualizarConexao() {
        val redeOk = try {
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            @Suppress("DEPRECATION")
            cm.activeNetworkInfo?.isConnected == true
        } catch (e: Exception) { true }

        val desde = System.currentTimeMillis() - Fila.ultimoContatoOk
        val (cor, texto) = when {
            Fila.ultimoContatoOk == 0L && !redeOk -> "#EF4444" to "sem internet"
            Fila.ultimoContatoOk == 0L -> "#F59E0B" to "conectando"
            desde < 15000 -> "#10B981" to "conectado"
            desde < 90000 -> "#F59E0B" to "instável"
            else -> "#EF4444" to "sem conexão"
        }
        pontoConexao.background?.setTint(Color.parseColor(cor))
        textoConexao.text = texto
    }

    private fun carregarLista() {
        Thread {
            val cobrancas = Fila.ultimas(estabelecimento, idTerminal)
            runOnUiThread { desenharLista(cobrancas) }
        }.start()
    }

    private fun desenharLista(cobrancas: List<Fila.Cobranca>) {
        lista.removeAllViews()
        vazio.visibility = if (cobrancas.isEmpty()) View.VISIBLE else View.GONE
        lista.visibility = if (cobrancas.isEmpty()) View.GONE else View.VISIBLE
        val inflador = LayoutInflater.from(this)
        cobrancas.forEach { c ->
            val linha = inflador.inflate(R.layout.item_cobranca, lista, false)
            val cor = when (c.status) {
                "approved" -> "#059669"
                "denied", "error", "expired" -> "#DC2626"
                "cancelled" -> "#B45309"
                else -> "#9CA3AF"
            }
            linha.findViewById<View>(R.id.marca).setBackgroundColor(Color.parseColor(cor))
            linha.findViewById<TextView>(R.id.linhaValor).text = emReais(c.valor)
            linha.findViewById<TextView>(R.id.linhaDetalhe).text = listOfNotNull(
                quandoLegivel(c.status),
                c.bandeira?.takeIf { it.isNotBlank() },
                c.nsu?.takeIf { it.isNotBlank() }?.let { "NSU $it" },
            ).joinToString(" · ")
            linha.findViewById<TextView>(R.id.linhaHora).text = horaDe(c.quando)
            lista.addView(linha)
        }
    }

    private fun quandoLegivel(status: String) = when (status) {
        "approved" -> "aprovada"
        "denied" -> "negada"
        "cancelled" -> "cancelada"
        "expired" -> "expirou"
        "error" -> "falhou"
        else -> status
    }

    private fun horaDe(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            val entrada = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.parse(iso.take(19))
            SimpleDateFormat("HH:mm", Locale.US).format(entrada ?: Date())
        } catch (e: Exception) { "" }
    }

    private fun emReais(valor: Double): String = "R$ " + String.format(Locale("pt", "BR"), "%,.2f", valor)

    // ── ajustes ──────────────────────────────────────────────────────────────

    private fun abrirAjustes() {
        val corpo = LayoutInflater.from(this).inflate(R.layout.dialog_config, null)
        val campoLoja = corpo.findViewById<EditText>(R.id.campoLoja)
        val campoNome = corpo.findViewById<EditText>(R.id.campoNome)
        val aviso = corpo.findViewById<TextView>(R.id.aviso)
        campoLoja.setText(estabelecimento)
        campoNome.setText(prefs.getString("nome", ""))

        val janela = AlertDialog.Builder(this)
            .setTitle("Ajustes do terminal")
            .setView(corpo)
            .setPositiveButton("Salvar", null)
            .setNegativeButton("Fechar", null)
            .create()

        janela.setOnShowListener {
            janela.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val loja = campoLoja.text.toString().trim()
                val nome = campoNome.text.toString().trim().ifBlank { "Terminal" }
                if (loja.isBlank()) {
                    aviso.visibility = View.VISIBLE
                    aviso.setTextColor(Color.parseColor("#DC2626"))
                    aviso.text = "Informe o código do estabelecimento."
                    return@setOnClickListener
                }
                aviso.visibility = View.VISIBLE
                aviso.setTextColor(Color.parseColor("#6B7280"))
                aviso.text = "Conferindo com o Velara..."
                Thread {
                    val id = Fila.registrar(loja, idTerminal, nome, JSONObject().put("app_version", BuildConfig.VERSION_NAME))
                    runOnUiThread {
                        if (!id.ok) {
                            aviso.setTextColor(Color.parseColor("#DC2626"))
                            aviso.text = if (id.motivo == "estabelecimento_nao_encontrado")
                                "Código não encontrado. Confira em Integrações, Getnet." else
                                "Não consegui falar com o Velara. Veja a internet da maquininha."
                            return@runOnUiThread
                        }
                        prefs.edit()
                            .putString("estabelecimento", loja)
                            .putString("nome", nome)
                            .putString("nome_loja", id.estabelecimento)
                            .apply()
                        nomeLoja = id.estabelecimento
                        atualizarCabecalho()
                        mostrarPronto()
                        carregarLista()
                        Toast.makeText(this, "Terminal ligado a ${id.estabelecimento}", Toast.LENGTH_LONG).show()
                        janela.dismiss()
                    }
                }.start()
            }
        }
        janela.show()
    }
}
