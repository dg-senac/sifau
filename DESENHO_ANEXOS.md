# Passo 7 — Desenho do modelo único de anexos

**Status:** ✅ **implementado** — a tabela está no `SETUP_COMPLETO.sql` e na migration
`20261014000000_create_anexos.sql`, com 19 testes próprios em `tests/suites/05-anexos.test.mjs`
(o que falta é o aplicativo passar a usar: passo 10).
**Decisões já tomadas por você:** modelo unificado · fotos reduzidas para 1280 px / ~250 KB.

---

## 1. O problema, com números medidos

Hoje **5 lugares diferentes** guardam arquivo, cada um com sua regra:

| Coluna | Tabela | Guarda | É exibido? |
|---|---|---|---|
| `fotos` | `ocorrencias` | text[] base64 | ❌ nunca |
| `fotos_depois` | `vistorias` | text[] base64 | ❌ nunca |
| `assinatura_autuado` | `autos_infracao` | text base64 | ❌ nunca |
| `arquivo_data` | `documentos` | text base64 | ✅ galeria |
| `attachments` | `admin_messages` | text[] base64 | ✅ painel |

Medido em PostgreSQL real, com conteúdo incompressível (base64 de JPEG real não comprime):

```
Um ciclo de fiscalização (ocorrência com 5 fotos + vistoria com 3 fotos):
  ocorrencias ........ 4,84 MB
  vistorias ......... 2,91 MB
  TOTAL ............. 7,83 MB por ciclo

Plano gratuito do Supabase (500 MB de banco):  ~63 ciclos antes de encher
```

**99,7% desse peso é conteúdo que nenhuma tela exibe.**

---

## 2. A tabela única

```sql
CREATE TABLE public.anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Vínculo. Exatamente um deve estar preenchido (CHECK no banco).
  ocorrencia_id      uuid REFERENCES public.ocorrencias(id) ON DELETE CASCADE,
  vistoria_id        uuid REFERENCES public.vistorias(id) ON DELETE CASCADE,
  ordem_servico_id   uuid REFERENCES public.ordens_servico(id) ON DELETE CASCADE,
  auto_infracao_id   uuid REFERENCES public.autos_infracao(id) ON DELETE CASCADE,
  mensagem_id        uuid REFERENCES public.admin_messages(id) ON DELETE CASCADE,

  tipo            text NOT NULL CHECK (tipo IN ('foto','foto_depois','assinatura','documento','relatorio','auto_infracao','anexo_mensagem')),
  momento         text,        -- 'antes' | 'depois' | NULL — dá sentido a foto/foto_depois

  -- O arquivo NÃO mora no banco: só o caminho no Storage.
  storage_path    text NOT NULL UNIQUE,
  arquivo_nome    text,
  arquivo_tipo    text,        -- MIME
  arquivo_bytes   integer,     -- tamanho real, para relatório de uso
  largura         integer,     -- dimensões, quando for imagem
  altura          integer,

  titulo          text,
  descricao       text,
  ordem           integer NOT NULL DEFAULT 0,
  metadados       jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
```

### Por que `momento`

É a peça que **torna a sua decisão pendente reversível**. O app de hoje grava foto "antes" (ocorrência) e "depois" (vistoria). Se a equipe decidir que essas fotos devem aparecer, é só uma tela nova ler `WHERE momento = 'antes'` — sem tocar no schema. Se decidir removê-las, é só parar de coletar. **O banco não precisa saber a resposta.**

### Por que os vínculos separados, e não um par `(entidade, entidade_id)`

Um par genérico não permitiria chave estrangeira, e sem FK o banco não garante que o vínculo aponta para algo existente. Prefiro 5 colunas com FK de verdade. O `CHECK` garante que **exatamente um** vínculo é preenchido.

---

## 3. O caminho no Storage

```
sifau/
└── {fiscal_id}/
    └── {ano}/{mes}/
        └── {anexo_id}.jpg
```

O primeiro nível por fiscal faz a política de bucket ser uma linha: cada fiscal só alcança a própria pasta. O `anexo_id` no nome garante unicidade sem colisão de nome de arquivo do usuário.

---

## 4. Segurança (a parte que a migration original errou)

A migration original do módulo de documentos **admitiu por escrito** ter exposto todos os arquivos a qualquer conta autenticada. O modelo novo evita isso por construção:

**No banco (RLS em `anexos`):**
- `SELECT`: dono, administrador, ou fiscal vinculado à ocorrência
- `INSERT`: exige `fiscal_id = auth.uid()` **e** que o alvo do vínculo pertença a quem está inserindo
- `UPDATE`: apenas as colunas `titulo`, `descricao`, `ordem` — o arquivo é imutável
- `DELETE`: apenas o dono

**No Storage:** bucket **privado** (`public = false`), sem URL permanente. Leitura só por **URL assinada de curta duração**, gerada a pedido da tela. Isso fecha o acesso anônimo de vez.

---

## 5. O que acontece com os 5 lugares atuais

| Hoje | Depois |
|---|---|
| `ocorrencias.fotos` | vira `anexos` com `momento='antes'` |
| `vistorias.fotos_depois` | vira `anexos` com `momento='depois'` |
| `autos_infracao.assinatura_autuado` | vira `anexos` com `tipo='assinatura'` |
| `documentos` (tabela inteira) | vira `anexos`; `DocumentGallery`/`DocumentHistory` apontam para a tabela nova |
| `admin_messages.attachments` | vira `anexos` com vínculo `mensagem_id` |

**Custo estimado:** ~430 linhas de frontend a ajustar (galeria, histórico, os 2 pontos de upload e o chat do painel). A galeria é a única que precisa de mais cuidado, porque hoje renderiza `arquivo_data` direto no `src` da imagem.

---

## 6. Riscos que reconheço

1. **É a maior mudança do plano até aqui.** Por isso o harness de testes vem antes (já está pronto) e o schema novo será validado lado a lado com o antigo.
2. **A galeria precisa trocar `src={base64}` por URL assinada.** Isso muda o carregamento das imagens e exige estado de erro/`loading` — mais código que hoje.
3. **`admin_messages.attachments` hoje é `text[]`** e é exibido no painel. Migrar esse ponto tem risco maior de regressão visual.
4. **Sem dado legado** (você vai refazer o banco), então não há migração de arquivos existentes — só a mudança de forma.

---

## 7. O que preciso de você

**Aprovar o desenho.** Se estiver de acordo, o passo 8 implementa: o `SETUP_COMPLETO.sql` consolidado, com esta tabela, sem nenhuma política `USING (true)` (mata o bug B1 na origem) e com `bootstrap_admin` ativando o fiscal (mata o B2 na origem).

---

## 8. O que foi implementado (passo 8) — e as duas diferenças em relação a este desenho

**Igual ao desenho:** as cinco colunas de vínculo com FK, o CHECK de exatamente um
vínculo, `tipo` com os 7 valores, `momento` (`antes`/`depois`/NULL), `storage_path`
único, dimensões, `metadados`, RLS e os grants por coluna. O `UPDATE` só alcança
`titulo`, `descricao` e `ordem`: o arquivo é imutável por permissão de coluna, não
por convenção do aplicativo.

**Diferença 1 — como o vínculo é conferido.** O desenho dizia "o alvo do vínculo
pertence a quem está inserindo". Isso virou uma função `SECURITY DEFINER`,
`attachment_links_belong_to_user(...)`, no mesmo padrão do
`document_relations_belong_to_user` que já existia para documentos. Ganho: as
regras do vínculo ficam em um lugar só e são testáveis. O caso de
`autos_infracao` (a única tabela vinculada **sem** coluna de fiscal — o dono vem
da ordem de serviço ou da ocorrência) está resolvido lá dentro.

**Diferença 2 — DELETE também pelo administrador.** O desenho dizia "apenas o
dono". O administrador pode apagar, para conseguir limpar um anexo impróprio sem
depender do fiscal. É o mesmo critério que `documentos` já usa.

**Verificado por teste** (`tests/suites/05-anexos.test.mjs`, 19 casos): anexo sem
vínculo e anexo com dois vínculos são recusados · anexo apontando para registro
inexistente é recusado pela FK · fiscal não anexa em ocorrência de outro nem em
nome de outro · caminho de arquivo duplicado é recusado · o dono vê, o fiscal
designado vê **só o alvo dele**, o administrador vê, o recém-cadastrado não vê
nada · o caminho do arquivo não muda por UPDATE · quem não é dono não apaga.
Testei a suíte **ao contrário**: enfraquecendo a política de INSERT, a de SELECT e
o CHECK, os testes correspondentes falham — ou seja, eles medem o que dizem medir.

**Um ponto que vale sua atenção:** a redução de qualidade das fotos que você aprovou (1280 px / 250 KB) será aplicada **também** às fotos de documento na galeria, que hoje usa 1920 px. Se a galeria servir para digitalizar documento com texto miúdo, 1280 px pode ser pouco para leitura. Se for esse o uso, mantenho 1920 px só nela. Me diga se a galeria é para registro fotográfico ou para digitalização de documento.
