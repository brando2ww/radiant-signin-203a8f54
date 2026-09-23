package app.velara.pos

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Conversa com o Velara.
 *
 * É a MESMA fila que a ponte de impressão atende no computador da loja
 * (pdv_tef_requests): o caixa grava a cobrança, quem estiver ouvindo reivindica,
 * executa e devolve o resultado na mesma linha. Aqui quem ouve é a maquininha.
 */
object Fila {

    private const val BASE = "https://velara-pdv.db.venzorgroup.com.br"
    private const val CHAVE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5NzU4MDg5LCJleHAiOjIxMDUxMTgwODl9.Vy8vjQHxKavjnxL_6rJ5tDyM4GhHsk5t6TBxmSxsJTw"
    private const val TEMPO_LIMITE = 15000

    /** Última conversa bem sucedida com o servidor, para o estado da conexão. */
    @Volatile var ultimoContatoOk: Long = 0L
        private set

    class Pedido(
        val id: String,
        val operacao: String,
        val valor: Double,
        val tipo: String?,
        val parcelas: Int,
        val financiamento: String?,
        val pedidoOriginal: String?,
    )

    class Identidade(val ok: Boolean, val estabelecimento: String?, val tefAtivo: Boolean, val motivo: String?)

    class Cobranca(val valor: Double, val status: String, val quando: String?, val bandeira: String?, val nsu: String?)

    /** Apresenta o terminal e confirma que o código do estabelecimento existe. */
    fun registrar(estabelecimento: String, terminal: String, nome: String?, info: JSONObject?): Identidade {
        val corpo = JSONObject()
            .put("p_tenant", estabelecimento)
            .put("p_device", terminal)
            .put("p_nome", nome ?: JSONObject.NULL)
            .put("p_info", info ?: JSONObject.NULL)
        val resposta = chamar("tef_terminal_registrar", corpo)
            ?: return Identidade(false, null, false, "sem_resposta")
        val o = JSONObject(resposta)
        return Identidade(
            ok = o.optBoolean("ok", false),
            estabelecimento = o.optString("estabelecimento", null),
            tefAtivo = o.optBoolean("tef_ativo", false),
            motivo = o.optString("motivo", null),
        )
    }

    /** Pega a próxima cobrança deste terminal, ou null se não houver. */
    fun reivindicar(estabelecimento: String, terminal: String): Pedido? {
        val corpo = JSONObject()
            .put("p_tenant", estabelecimento)
            .put("p_device", terminal)
            .put("p_limit", 1)
        val resposta = chamar("tef_bridge_claim_batch", corpo) ?: return null
        val lista = JSONArray(resposta)
        if (lista.length() == 0) return null
        val o = lista.getJSONObject(0)
        return Pedido(
            id = o.getString("id"),
            operacao = o.optString("operation", "venda"),
            valor = o.optDouble("amount", 0.0),
            tipo = o.optString("payment_type", null),
            parcelas = o.optInt("installments", 1),
            financiamento = o.optString("financing", null),
            pedidoOriginal = o.optString("original_request_id", null),
        )
    }

    /** Devolve o resultado da maquininha para a linha do pedido. */
    fun concluir(id: String, status: String, resultado: JSONObject?, erro: String?): Boolean {
        val corpo = JSONObject()
            .put("p_request_id", id)
            .put("p_status", status)
            .put("p_result", resultado ?: JSONObject.NULL)
            .put("p_error", erro ?: JSONObject.NULL)
        return chamar("tef_bridge_finish", corpo) != null
    }

    /** Últimas cobranças deste terminal, para a lista da tela. */
    fun ultimas(estabelecimento: String, terminal: String, quantas: Int = 6): List<Cobranca> {
        val corpo = JSONObject()
            .put("p_tenant", estabelecimento)
            .put("p_device", terminal)
            .put("p_limit", quantas)
        val resposta = chamar("tef_terminal_ultimas", corpo) ?: return emptyList()
        val lista = JSONArray(resposta)
        return (0 until lista.length()).map {
            val o = lista.getJSONObject(it)
            Cobranca(
                valor = o.optDouble("valor", 0.0),
                status = o.optString("status", ""),
                quando = o.optString("quando", null),
                bandeira = o.optString("bandeira", null),
                nsu = o.optString("nsu", null),
            )
        }
    }

    /** Dados da venda que um cancelamento desfaz (CV, valor e data). */
    fun vendaOriginal(estabelecimento: String, idDaVenda: String): JSONObject? {
        val corpo = JSONObject().put("p_tenant", estabelecimento).put("p_request_id", idDaVenda)
        val resposta = chamar("tef_terminal_venda_original", corpo) ?: return null
        val o = JSONObject(resposta)
        return if (o.length() == 0) null else o
    }

    private fun chamar(rota: String, corpo: JSONObject): String? {
        var conexao: HttpURLConnection? = null
        return try {
            conexao = (URL("$BASE/rest/v1/rpc/$rota").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = TEMPO_LIMITE
                readTimeout = TEMPO_LIMITE
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", CHAVE)
                setRequestProperty("Authorization", "Bearer $CHAVE")
            }
            conexao.outputStream.use { it.write(corpo.toString().toByteArray(Charsets.UTF_8)) }
            val codigo = conexao.responseCode
            val fluxo = if (codigo in 200..299) conexao.inputStream else conexao.errorStream
            val texto = BufferedReader(InputStreamReader(fluxo, Charsets.UTF_8)).use { it.readText() }
            if (codigo in 200..299) {
                ultimoContatoOk = System.currentTimeMillis()
                texto
            } else null
        } catch (e: Exception) {
            null
        } finally {
            conexao?.disconnect()
        }
    }
}
