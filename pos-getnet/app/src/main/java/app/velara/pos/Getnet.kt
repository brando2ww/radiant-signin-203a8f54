package app.velara.pos

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import java.util.Locale
import kotlin.math.roundToLong

/**
 * As chamadas à aplicação de Pagamento da Getnet, conforme a documentação
 * "API de Pagamento · POS Digital": tudo por deeplink, com os dados indo e
 * voltando por Intent, e todo parâmetro como texto.
 */
object Getnet {

    const val PAGAMENTO = 1001
    const val REIMPRESSAO = 1002
    const val INFO = 1003
    const val ESTORNO = 1004

    /** 12 dígitos, os dois últimos são os centavos: R$ 12,34 vira 000000001234. */
    fun valor12(valor: Double): String = String.format(Locale.US, "%012d", (valor * 100).roundToLong())

    fun pagamento(valor: Double, tipo: String?, parcelas: Int, financiamento: String?): Intent {
        val dados = Bundle().apply {
            putString("amount", valor12(valor))
            putString("currencyCode", "986")
            when (tipo) {
                "credito" -> {
                    putString("paymentType", "credit")
                    if (parcelas > 1) {
                        // creditMerchant = parcelado pela loja · creditIssuer = pelo emissor
                        putString("creditType", if (financiamento == "emissor") "creditIssuer" else "creditMerchant")
                        putString("installments", parcelas.toString())
                    }
                }
                "debito" -> putString("paymentType", "debit")
                "voucher" -> putString("paymentType", "voucher")
                // Sem tipo, a própria maquininha pergunta ao operador.
            }
        }
        return Intent(Intent.ACTION_VIEW, Uri.parse("getnet://pagamento/v1/payment")).putExtras(dados)
    }

    /** Estorno só vale no mesmo dia, pela documentação. */
    fun estorno(valor: Double, dataTransacao: String?, cv: String?, terminalOrigem: String?): Intent {
        val dados = Bundle().apply {
            putString("amount", valor12(valor))
            if (!dataTransacao.isNullOrBlank()) putString("transactionDate", dataTransacao)
            if (!cv.isNullOrBlank()) putString("cvNumber", cv)
            if (!terminalOrigem.isNullOrBlank()) putString("originTerminal", terminalOrigem)
        }
        return Intent(Intent.ACTION_VIEW, Uri.parse("getnet://pagamento/v1/refund")).putExtras(dados)
    }

    fun reimpressao(): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("getnet://pagamento/v1/reprint"))

    fun informacoes(): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("getnet://pagamento/v1/getinfos"))

    /** 0 sucesso · 1 negada · 2 cancelada · 3 falha · 4 desconhecido */
    fun statusDe(codigo: String?): String = when (codigo) {
        "0" -> "approved"
        "1" -> "denied"
        "2" -> "cancelled"
        else -> "error"
    }

    fun modalidadeLegivel(codigo: String?): String = when (codigo) {
        "02" -> "débito"
        "11" -> "crédito à vista"
        "12" -> "crédito parcelado loja"
        "13" -> "crédito parcelado emissor"
        "03" -> "voucher"
        else -> "cartão"
    }

    fun formaDeEntrada(codigo: String?): String = when (codigo) {
        "021" -> "tarja"
        "051" -> "chip"
        "071" -> "aproximação"
        "801" -> "tarja (fallback)"
        else -> ""
    }
}
