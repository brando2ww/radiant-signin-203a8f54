package app.velara.pos

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import kotlin.math.roundToLong

/**
 * Terminal de cobrança do Velara na maquininha Getnet.
 *
 * O caixa manda o valor pelo sistema, este app pega da fila, abre a aplicação
 * de Pagamento da Getnet pelo deeplink e devolve NSU, autorização e bandeira
 * para o pedido. Ninguém digita valor na maquininha.
 */
class MainActivity : AppCompatActivity() {

    private companion object {
        const val PEDIDO_PAGAMENTO = 1001
        const val INTERVALO_MS = 3000L
        const val PREFS = "velara"
    }

    private lateinit var tituloLoja: TextView
    private lateinit var terminalTxt: TextView
    private lateinit var estado: TextView
    private lateinit var detalhe: TextView
    private lateinit var ultima: TextView
    private lateinit var rodape: TextView

    private val relogio = Handler(Looper.getMainLooper())
    private var ocupado = false
    private var pedidoAtual: Fila.Pedido? = null

    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }
    private val estabelecimento get() = prefs.getString("estabelecimento", "") ?: ""
    private val nomeTerminal get() = prefs.getString("nome", "Maquininha") ?: "Maquininha"
    private val idTerminal: String
        get() {
            var id = prefs.getString("terminal", null)
            if (id == null) {
                id = UUID.randomUUID().toString()
                prefs.edit().putString("terminal", id).apply()
            }
            return id
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        tituloLoja = findViewById(R.id.tituloLoja)
        terminalTxt = findViewById(R.id.terminal)
        estado = findViewById(R.id.estado)
        detalhe = findViewById(R.id.detalhe)
        ultima = findViewById(R.id.ultima)
        rodape = findViewById(R.id.rodape)
        findViewById<Button>(R.id.botaoConfig).setOnClickListener { abrirConfiguracao() }

        rodape.text = "Velara PDV ${BuildConfig.VERSION_NAME} · terminal ${idTerminal.take(8)}"
        atualizarCabecalho()
        if (estabelecimento.isBlank()) abrirConfiguracao()
    }

    override fun onResume() {
        super.onResume()
        relogio.post(ciclo)
    }

    override fun onPause() {
        super.onPause()
        relogio.removeCallbacks(ciclo)
    }

    private fun atualizarCabecalho() {
        tituloLoja.text = nomeTerminal
        terminalTxt.text = if (estabelecimento.isBlank()) {
            "Terminal não configurado"
        } else {
            "Estabelecimento ${estabelecimento.take(8)}"
        }
    }

    /** Laço: pergunta à fila se há cobrança para este terminal. */
    private val ciclo = object : Runnable {
        override fun run() {
            if (!ocupado && estabelecimento.isNotBlank()) buscar()
            relogio.postDelayed(this, INTERVALO_MS)
        }
    }

    private fun buscar() {
        ocupado = true
        Thread {
            val pedido = Fila.reivindicar(estabelecimento, idTerminal)
            runOnUiThread {
                if (pedido == null) {
                    ocupado = false
                    if (estado.text != "Aguardando cobrança") mostrarEspera()
                } else {
                    executar(pedido)
                }
            }
        }.start()
    }

    /** Cinza escuro parado, verde aprovado, vermelho quando não passou. */
    private fun pintar(cor: String) {
        estado.setTextColor(Color.parseColor(cor))
    }

    private fun mostrarEspera() {
        pintar("#111827")
        estado.text = "Aguardando cobrança"
        detalhe.text = "Este terminal recebe o valor direto do caixa."
    }

    private fun executar(pedido: Fila.Pedido) {
        pedidoAtual = pedido

        // "teste" é o botão de teste da tela de integrações: responde na hora,
        // sem acordar a aplicação de pagamento nem pedir cartão.
        if (pedido.operacao == "teste") {
            concluir(pedido.id, "approved", JSONObject().put("mensagem", "Terminal respondendo"), null)
            pintar("#059669")
            estado.text = "Teste recebido"
            detalhe.text = "A maquininha está conectada ao caixa."
            return
        }

        if (pedido.operacao != "venda") {
            concluir(pedido.id, "error", null, "Operação ${pedido.operacao} não é feita por este terminal")
            return
        }

        pintar("#111827")
        estado.text = "Cobrando ${emReais(pedido.valor)}"
        detalhe.text = "Aproxime, insira ou passe o cartão."

        val dados = Bundle().apply {
            // 12 dígitos, os dois últimos são os centavos.
            putString("amount", String.format(Locale.US, "%012d", (pedido.valor * 100).roundToLong()))
            putString("currencyCode", "986")
            when (pedido.tipo) {
                "credito" -> {
                    putString("paymentType", "credit")
                    if (pedido.parcelas > 1) {
                        putString("creditType", if (pedido.financiamento == "emissor") "creditIssuer" else "creditMerchant")
                        putString("installments", pedido.parcelas.toString())
                    }
                }
                "debito" -> putString("paymentType", "debit")
                "voucher" -> putString("paymentType", "voucher")
                // Sem tipo definido, a própria maquininha pergunta.
            }
        }

        val intencao = Intent(Intent.ACTION_VIEW, Uri.parse("getnet://pagamento/v1/payment")).apply {
            putExtras(dados)
        }
        try {
            startActivityForResult(intencao, PEDIDO_PAGAMENTO)
        } catch (e: Exception) {
            concluir(pedido.id, "error", null, "Aplicação de pagamento da Getnet não encontrada neste terminal")
            pintar("#DC2626")
            estado.text = "Falha ao abrir o pagamento"
            detalhe.text = "A aplicação de Pagamento da Getnet não respondeu."
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PEDIDO_PAGAMENTO) return
        val pedido = pedidoAtual ?: return

        val e = data?.extras
        // 0 sucesso · 1 negada · 2 cancelada · 3 falha · 4 desconhecido
        val codigo = e?.getString("result")
        val motivo = e?.getString("resultDetails")

        if (e == null) {
            concluir(pedido.id, "cancelled", null, "Cobrança encerrada na maquininha")
            pintar("#DC2626")
            estado.text = "Cobrança cancelada"
            detalhe.text = "Nada foi cobrado."
            return
        }

        val status = when (codigo) {
            "0" -> "approved"
            "1" -> "denied"
            "2" -> "cancelled"
            else -> "error"
        }

        val resultado = JSONObject()
            .put("nsu", e.getString("nsu") ?: JSONObject.NULL)
            .put("autorizacao", e.getString("authorizationCode") ?: JSONObject.NULL)
            .put("bandeira", e.getString("brand") ?: JSONObject.NULL)
            .put("cartao_final", e.getString("cardLastDigits") ?: JSONObject.NULL)
            .put("modalidade", tipoLegivel(e.getString("type")))
            .put("parcelas", e.getString("installments")?.toIntOrNull() ?: pedido.parcelas)
            .put("nsu_local", e.getString("nsuLocal") ?: JSONObject.NULL)
            .put("portador", e.getString("cardholderName") ?: JSONObject.NULL)
            .put("terminal", nomeTerminal)

        concluir(pedido.id, status, resultado, if (status == "approved") null else (motivo ?: "Transação não aprovada"))

        if (status == "approved") {
            pintar("#059669")
            estado.text = "Aprovado"
            detalhe.text = "${e.getString("brand") ?: "Cartão"} · NSU ${e.getString("nsu") ?: "-"}"
            ultima.text = "Última cobrança: ${emReais(pedido.valor)} aprovada"
        } else {
            pintar("#DC2626")
            estado.text = "Não aprovado"
            detalhe.text = motivo ?: "A transação não foi concluída."
            ultima.text = "Última cobrança: ${emReais(pedido.valor)} não aprovada"
        }
    }

    private fun tipoLegivel(codigo: String?): String = when (codigo) {
        "02" -> "debito"
        "11" -> "credito"
        "12" -> "credito parcelado lojista"
        "13" -> "credito parcelado emissor"
        "03" -> "voucher"
        else -> "cartao"
    }

    private fun concluir(id: String, status: String, resultado: JSONObject?, erro: String?) {
        Thread {
            Fila.concluir(id, status, resultado, erro)
            runOnUiThread {
                ocupado = false
                pedidoAtual = null
            }
        }.start()
    }

    private fun emReais(valor: Double): String = "R$ " + String.format(Locale("pt", "BR"), "%,.2f", valor)

    private fun abrirConfiguracao() {
        val campoLoja = EditText(this).apply {
            hint = "Código do estabelecimento"
            setText(estabelecimento)
            inputType = InputType.TYPE_CLASS_TEXT
        }
        val campoNome = EditText(this).apply {
            hint = "Nome do terminal (ex.: Caixa 1)"
            setText(prefs.getString("nome", ""))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        }
        val caixa = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 20, 40, 0)
            addView(campoLoja)
            addView(campoNome)
        }
        AlertDialog.Builder(this)
            .setTitle("Configurar terminal")
            .setMessage("O código do estabelecimento está no Velara, em Integrações, Getnet.")
            .setView(caixa)
            .setPositiveButton("Salvar") { _, _ ->
                prefs.edit()
                    .putString("estabelecimento", campoLoja.text.toString().trim())
                    .putString("nome", campoNome.text.toString().trim().ifBlank { "Maquininha" })
                    .apply()
                atualizarCabecalho()
                mostrarEspera()
                Toast.makeText(this, "Terminal configurado", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }
}
