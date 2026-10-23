import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE_TEMA, lerTema, aplicarTema, inicializarTema, trocarTema } from '../../src/lib/tema.ts';

test('tema segue o sistema no primeiro acesso e respeita a escolha salva depois', () => {
  assert.equal(lerTema(undefined, true), 'escuro'); assert.equal(lerTema(undefined, false), 'claro');
  assert.equal(lerTema({ getItem: () => 'claro' }, true), 'claro');
  assert.equal(lerTema({ getItem: () => 'escuro' }, false), 'escuro');
  assert.equal(lerTema({ getItem: () => 'valor inválido' }, true), 'escuro');
});
test('armazenamento bloqueado não impede leitura da preferência inicial', () => {
  assert.equal(lerTema({ getItem: () => { throw new Error('bloqueado'); } }, true), 'escuro');
});
test('inicialização e alternância atualizam página, controles nativos e cor do navegador', () => {
  const anteriorDoc = globalThis.document; const anteriorWindow = globalThis.window;
  let meta = ''; let salvo = 'escuro'; let eventos = 0;
  globalThis.document = { documentElement: { dataset: {}, style: {} }, querySelector: () => ({ setAttribute: (_, v) => { meta = v; } }) };
  globalThis.window = { localStorage: { getItem: () => salvo, setItem: (k, v) => { assert.equal(k, CHAVE_TEMA); salvo = v; } },
    matchMedia: () => ({ matches: false }), dispatchEvent: () => { eventos++; } };
  try {
    assert.equal(inicializarTema(), 'escuro'); assert.equal(document.documentElement.dataset.tema, 'escuro');
    assert.equal(document.documentElement.style.colorScheme, 'dark'); assert.equal(meta, '#101b2c');
    trocarTema('claro'); assert.equal(salvo, 'claro'); assert.equal(meta, '#0d428b'); assert.equal(eventos, 1);
    window.localStorage.setItem = () => { throw new Error('sem espaço'); };
    assert.doesNotThrow(() => trocarTema('escuro')); assert.equal(document.documentElement.dataset.tema, 'escuro');
    aplicarTema('claro'); assert.equal(document.documentElement.style.colorScheme, 'light');
  } finally {
    if (anteriorDoc === undefined) delete globalThis.document; else globalThis.document = anteriorDoc;
    if (anteriorWindow === undefined) delete globalThis.window; else globalThis.window = anteriorWindow;
  }
});
