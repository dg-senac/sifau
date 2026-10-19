package br.recife.sifau;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Registra o plugin próprio que abre as configurações do aplicativo
        // (usado quando a permissão de localização fica bloqueada).
        registerPlugin(AbrirConfiguracoesPlugin.class);
    }
}
