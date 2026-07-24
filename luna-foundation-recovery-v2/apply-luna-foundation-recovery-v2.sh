#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  echo "Erro: execute este script dentro do repositorio YuiSync." >&2
  exit 1
fi
cd "$ROOT"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/yuisync-luna-autonomy-foundation.patch"

if [ ! -f "$PATCH_FILE" ]; then
  echo "Erro: patch nao encontrado: $PATCH_FILE" >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "feat/luna-autonomy-foundation" ]; then
  echo "Erro: branch atual e '$BRANCH'. Troque para feat/luna-autonomy-foundation." >&2
  exit 1
fi

# A tentativa anterior falhou antes de aplicar o patch. Estes auxiliares nao entram no commit.
rm -f fix-luna-foundation-validation.sh
rm -rf luna-foundation-recovery

if [ ! -f server/lib/luna/operationState.js ]; then
  echo "Aplicando os arquivos da fundacao sem depender da versao exata do package.json..."
  # package.json e quality.yml sao atualizados abaixo de forma estrutural e idempotente.
  git apply --check \
    --exclude=package.json \
    --exclude=.github/workflows/quality.yml \
    "$PATCH_FILE"
  git apply \
    --exclude=package.json \
    --exclude=.github/workflows/quality.yml \
    "$PATCH_FILE"
else
  echo "Os arquivos da fundacao ja existem; mantendo-os e seguindo com a normalizacao."
fi

python3 - <<'PY'
from pathlib import Path
import json
import re

# package.json: altera somente scripts, preservando quaisquer comandos novos do repositorio.
package_path = Path('package.json')
package = json.loads(package_path.read_text())
scripts = package.setdefault('scripts', {})
scripts['test:luna:unit'] = 'node --test test/luna/*.test.mjs'
scripts['test:luna:regressions'] = 'node scripts/run-luna-scenarios.mjs'
scripts['test:luna'] = 'npm run test:luna:unit && npm run test:luna:regressions'

test_all = scripts.get('test:all', '')
if test_all and 'npm run test:luna' not in test_all:
    marker = 'npm run test:petbot'
    if marker in test_all:
        test_all = test_all.replace(marker, marker + ' && npm run test:luna', 1)
    else:
        test_all = test_all + ' && npm run test:luna'
    scripts['test:all'] = test_all

package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n')

# CI: adiciona o gate da Luna sem substituir os testes existentes.
workflow_path = Path('.github/workflows/quality.yml')
if workflow_path.exists():
    workflow = workflow_path.read_text()
    if 'run: npm run test:luna' not in workflow:
        line = '      - run: npm run test:petbot\n'
        if line in workflow:
            workflow = workflow.replace(line, line + '      - run: npm run test:luna\n', 1)
        else:
            raise SystemExit('Nao encontrei o passo npm run test:petbot em quality.yml.')
        workflow_path.write_text(workflow)

# Assercoes estaticas antigas: passam a verificar contratos atuais e nao textos obsoletos.
test_path = Path('test/petbotStatic.test.mjs')
if not test_path.exists():
    raise SystemExit('Arquivo nao encontrado: test/petbotStatic.test.mjs')
text = test_path.read_text()

old_confirmation = "  assert.match(localChat, /!turnSemantics\\?\\.confirmation_decision_made[\\s\\S]*isExplicitPetbotConfirmation/)"
new_confirmation = "\n".join([
    "  assert.match(localChat, /const explicitCurrentMessageConfirmation = Boolean\\([\\s\\S]*pendingAtTurnStart[\\s\\S]*isExplicitPetbotConfirmation\\(trimmedMessage\\)/)",
    "  assert.match(localChat, /const trustedCurrentMessageConfirmation = Boolean\\([\\s\\S]*explicitCurrentMessageConfirmation[\\s\\S]*turnSemantics\\?\\.confirms_pending_order/)",
])
text = text.replace(old_confirmation, new_confirmation)

# Evita depender de acento ou titulo visual; valida a configuracao real.
text = re.sub(
    r'^\s*assert\.match\(settings,\s*/Mensagens padrao/\)\s*$',
    '  assert.match(settings, /message_templates/)',
    text,
    flags=re.MULTILINE,
)
text = re.sub(
    r'^\s*assert\.match\(settings,\s*/Mensagens padrão/\)\s*$',
    '  assert.match(settings, /message_templates/)',
    text,
    flags=re.MULTILINE,
)

# O painel atual e o componente PetbotDiagnosticSuite, nao o botao legado de 3 testes.
text = re.sub(
    r'^(\s*)assert\.match\(([^,\n]+),\s*/Executar os 3 testes/\)\s*$',
    lambda m: f"{m.group(1)}assert.match({m.group(2).strip()}, /PetbotDiagnosticSuite/)",
    text,
    flags=re.MULTILINE,
)

remaining = []
if '!turnSemantics?.confirmation_decision_made' in text:
    remaining.append('confirmacao estatica antiga')
if 'Mensagens padrao/' in text or 'Mensagens padrão/' in text:
    remaining.append('titulo antigo de mensagens')
if 'Executar os 3 testes/' in text:
    remaining.append('botao antigo de 3 testes')
if remaining:
    raise SystemExit('Nao consegui atualizar: ' + ', '.join(remaining))

test_path.write_text(text)
PY

required=(
  scripts/run-luna-scenarios.mjs
  server/lib/luna/errors.js
  server/lib/luna/index.js
  server/lib/luna/legacyAdapter.js
  server/lib/luna/operationEvents.js
  server/lib/luna/operationReducer.js
  server/lib/luna/operationState.js
  server/lib/luna/scenarioRunner.js
  server/lib/luna/trace.js
  server/lib/luna/verifier.js
  test/luna/operationReducer.test.mjs
  test/luna/scenarioRunner.test.mjs
)
for file in "${required[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Erro: arquivo esperado nao existe: $file" >&2
    exit 1
  fi
done

echo
echo "Validando..."
node --check server/lib/chat.js
node --test test/petbotStatic.test.mjs
npm run test:luna
npm run typecheck
npm run build
git diff --check

if [ "$SCRIPT_DIR" = "$ROOT/luna-foundation-recovery-v2" ]; then
  rm -rf "$SCRIPT_DIR"
fi

echo
echo "Validacao concluida sem erros."
echo "Confira com: git status --short"
echo "Depois: git add -A && git commit && git push"
