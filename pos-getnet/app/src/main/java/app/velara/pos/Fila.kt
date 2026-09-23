package app.velara.pos

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Conversa com a fila de cobranças do Velara.
 *
 * É a MESMA fila que a ponte de impressão atende no computador da loja
 * (pdv_tef_requests): o caixa grava o pedido, quem estiver ouvindo reivindica,
 * executa e devolve o resultado na mesma linha. Aqui quem ouve é a maquininha.
 */
object Fila {

    private const val BASE = "https://velara-pdv.db.venzorgroup.com.br"
    private const val CHAVE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5NzU4MDg5LCJleHAiOjIxMDUxMTgwODl9.Vy8vjQHxKavjnxL_6rJ5tDyM4GhHsk5t6TBxmSxsJTw"
    private const val TEMPO_LIMITE = 20000

    class Pedido(
        val id: String,
        val operacao: String,
        val valor: Double,
        val tipo: String?,
        val parcelas: Int,
        val financiamento: String?,
    )

    /** Pega o próximo pedido de cobrança deste terminal, ou null se não houver. */
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
            if (codigo in 200..299) texto else null
        } catch (e: Exception) {
            null
        } finally {
            conexao?.disconnect()
        }
    }
}
