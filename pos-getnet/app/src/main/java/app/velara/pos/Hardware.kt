package app.velara.pos

import android.content.Context
import com.getnet.posdigital.PosDigital
import com.getnet.posdigital.info.IInfoCallback
import com.getnet.posdigital.info.InfoResponse

/**
 * O SDK de Hardware da Getnet (libposdigital), obrigatório pelos requisitos de
 * certificação da GetStore. Ele é a camada entre o app e o equipamento, igual
 * em P2, P3 e DX8000: é por ele que sai o número de série que identifica o
 * terminal no Velara, e não por um código inventado pelo app.
 *
 * Fora de uma maquininha (emulador, celular) o serviço não existe; aí
 * [conectado] fica falso e o app segue com o que tiver.
 */
object Hardware {

    class Terminal(val serie: String?, val modelo: String?, val fabricante: String?, val sdk: String?)

    @Volatile var conectado = false
        private set

    fun ligar(contexto: Context, aoConectar: () -> Unit, aoCair: () -> Unit) {
        try {
            PosDigital.register(contexto.applicationContext, object : PosDigital.BindCallback {
                override fun onConnected() {
                    conectado = true
                    aoConectar()
                }

                override fun onDisconnected() {
                    conectado = false
                    aoCair()
                }

                override fun onError(e: Exception) {
                    conectado = false
                    aoCair()
                }
            })
        } catch (e: Exception) {
            conectado = false
        }
    }

    fun desligar(contexto: Context) {
        try {
            PosDigital.unregister(contexto.applicationContext)
        } catch (e: Exception) {
            // Já estava solto.
        }
        conectado = false
    }

    /** Pergunta ao equipamento quem ele é. A resposta chega fora da thread da tela. */
    fun informacoes(resposta: (Terminal?) -> Unit) {
        try {
            // A biblioteca é Kotlin e declara getInfo()/isInitiated() como
            // funções, não propriedades: chamada com parênteses mesmo.
            val sdk = PosDigital.getInstance()
            if (!sdk.isInitiated()) {
                resposta(null)
                return
            }
            sdk.getInfo().info(object : IInfoCallback.Stub() {
                override fun onInfo(info: InfoResponse?) {
                    resposta(
                        info?.let {
                            Terminal(
                                serie = it.serialNumber?.trim()?.takeIf { s -> s.isNotEmpty() },
                                modelo = it.model?.trim(),
                                fabricante = it.manufacture?.trim(),
                                sdk = it.sdkVersion?.trim(),
                            )
                        },
                    )
                }

                override fun onError(erro: String?) = resposta(null)
            })
        } catch (e: Exception) {
            resposta(null)
        }
    }
}
