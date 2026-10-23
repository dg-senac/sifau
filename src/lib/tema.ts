export type Tema = 'claro' | 'escuro';
export const CHAVE_TEMA = 'sifau:tema';
type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

export function lerTema(storage?: Armazenamento, sistemaEscuro = false): Tema {
  try {
    const salvo = storage?.getItem(CHAVE_TEMA);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch { /* Navegação privada pode impedir acesso ao armazenamento. */ }
  return sistemaEscuro ? 'escuro' : 'claro';
}
export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  document.documentElement.style.colorScheme = tema === 'escuro' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'escuro' ? '#101b2c' : '#0d428b');
}
export function inicializarTema() {
  let storage: Armazenamento | undefined;
  try { storage = window.localStorage; } catch { /* O botão ainda funciona sem persistência. */ }
  const tema = lerTema(storage, window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  aplicarTema(tema);
  return tema;
}
export function trocarTema(tema: Tema) {
  aplicarTema(tema);
  try { window.localStorage.setItem(CHAVE_TEMA, tema); } catch { /* Mantém o tema durante a sessão. */ }
  window.dispatchEvent(new Event('sifau:tema-alterado'));
}
