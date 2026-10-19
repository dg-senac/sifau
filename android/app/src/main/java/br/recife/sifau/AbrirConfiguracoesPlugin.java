package br.recife.sifau;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Abre a tela do sistema com os detalhes do SIFAU, onde ficam as permissões.
 * Usado quando o fiscal bloqueia a permissão de localização permanentemente:
 * o Android deixa de exibir a caixa de diálogo e o único caminho é este.
 */
@CapacitorPlugin(name = "AbrirConfiguracoes")
public class AbrirConfiguracoesPlugin extends Plugin {

    @PluginMethod
    public void abrir(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getActivity().getPackageName(), null));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível abrir as configurações: " + e.getMessage());
        }
    }
}
