// ============================================================================
// SIFAU — Fontes servidas pelo próprio aplicativo
// ============================================================================
// Por que este arquivo existe, em vez de um `@import` do Google Fonts no
// `index.css` como era antes:
//
// 1. O aplicativo instalado precisa funcionar sem internet. Com a fonte vindo
//    de fora, o fiscal em campo sem sinal abria o app e via a tipografia cair
//    para a fonte do sistema — o layout foi desenhado em cima da Space Grotesk e
//    da DM Sans, então o app ficava com outra cara justamente quando a conexão
//    falha, que é o momento em que ele mais precisa parecer confiável.
// 2. O `@import` do Google bloqueia a primeira pintura: o navegador precisa
//    baixar o CSS, descobrir os arquivos de fonte e só então desenhar o texto.
//    Com os arquivos aqui dentro, a fonte chega junto com o resto do app.
// 3. Numa rede municipal, o domínio de fontes do Google pode estar bloqueado ou
//    lento — e o pedido sai a cada abertura, com o IP de quem abriu o app.
//
// Os pesos abaixo são exatamente os que o aplicativo usa (700, 600, 400 e 500).
// Os demais pesos existem no pacote e não são carregados: cada peso não usado
// seria ~21 KB inúteis dentro do APK.
//
// `latin` e `latin-ext` são os dois subconjuntos que cobrem o português e os
// nomes e endereços digitados pelos fiscais. O navegador só baixa o arquivo do
// conjunto que a página realmente precisa usar.
//
// A checagem `npm run test:assets` impede que uma fonte de terceiro volte por
// descuido.

// DM Sans — texto (o `font-family` do body)
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/dm-sans/latin-ext-400.css';
import '@fontsource/dm-sans/latin-ext-500.css';
import '@fontsource/dm-sans/latin-ext-600.css';
import '@fontsource/dm-sans/latin-ext-700.css';

// Space Grotesk — títulos, números de destaque e a marca SIFAU
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/space-grotesk/latin-ext-500.css';
import '@fontsource/space-grotesk/latin-ext-600.css';
import '@fontsource/space-grotesk/latin-ext-700.css';
