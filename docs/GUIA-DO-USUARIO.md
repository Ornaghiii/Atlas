# Atlas — Guia do Usuário

> Seu controle financeiro pessoal, simples e bonito.

---

## O que é o Atlas?

O Atlas é um aplicativo de finanças pessoais que roda direto no seu computador, sem precisar de internet, sem cadastro, sem mensalidade. Todos os seus dados ficam guardados na sua própria máquina — ninguém tem acesso a eles além de você.

Com ele você consegue:
- Registrar suas receitas e despesas
- Acompanhar seus investimentos e patrimônio
- Criar metas financeiras e acompanhar o progresso
- Simular como seu dinheiro pode crescer ao longo do tempo
- Fazer backup e restaurar seus dados quando quiser

---

## Instalação

1. Abra o arquivo **Atlas Setup 1.0.0.exe**
2. Siga os passos da instalação (você pode escolher onde instalar)
3. Abra o Atlas pelo atalho criado na área de trabalho ou no menu Iniciar

Na primeira vez que abrir, o app pode demorar alguns segundos para carregar — isso é normal, ele está iniciando o banco de dados interno.

---

## Telas do Atlas

### Visão Geral

É a tela inicial. Aqui você vê um resumo de tudo:

- **Patrimônio total** — soma de todos os seus ativos cadastrados, com um gráfico mostrando a evolução dos últimos 5 meses
- **Missão atual** — o objetivo financeiro com maior prioridade que você ainda não concluiu
- **Saldo disponível** — quanto você tem livre (receitas menos despesas e aportes)
- **Investido** — total aplicado em ativos que não são conta ou dinheiro em carteira
- **Em conta** — saldo em contas e dinheiro físico
- **Economia mensal** — quanto você economizou esse mês

O número em verde (ou vermelho) ao lado do patrimônio mostra a variação percentual em relação ao mês anterior.

---

### Receitas

Aqui ficam listadas todas as suas entradas de dinheiro. Você pode:

- Ver o total de receitas do mês atual
- Filtrar entre "Todos os lançamentos" ou "Só receitas"
- Excluir um lançamento (clique no ícone de lixeira)

Para adicionar uma receita, clique em **+ Novo registro** no canto superior direito da tela.

---

### Despesas

Igual à tela de Receitas, mas focada nas suas saídas de dinheiro. O funcionamento é o mesmo.

---

### Patrimônio

Lista todos os seus ativos — investimentos, contas, reservas, etc. Para cada ativo você pode:

- **Aportar** — adicionar dinheiro ao ativo (isso cria um lançamento do tipo "Aporte" automaticamente)
- **Resgatar** — retirar dinheiro do ativo (cria um lançamento do tipo "Resgate")
- **Atualizar saldo** — informar o valor atual do ativo sem criar movimentação (útil para marcar a mercado)
- **Excluir** o ativo

O Atlas calcula automaticamente o lucro ou prejuízo de cada ativo comparando o valor atual com o total que você aportou.

**Para cadastrar um novo ativo**, clique em **+ Novo ativo** e preencha:
- Nome (ex.: "Tesouro Selic 2029")
- Categoria (Tesouro, CDB, ETF, Ações, FII, Conta, Dinheiro ou Outros)
- Instituição (opcional, ex.: "Nubank")
- Valor atual

> **Dica:** Use a categoria "Conta" ou "Dinheiro" para dinheiro em conta corrente ou físico. Esses ativos entram no campo "Em conta" da visão geral. Todos os outros entram em "Investido".

---

### Objetivos

Aqui você cria e acompanha suas metas financeiras — reserva de emergência, entrada de imóvel, viagem, etc.

O progresso de cada objetivo vem automaticamente do **investimento vinculado** a ele. Ou seja, você escolhe qual ativo do Atlas representa aquela meta, e o progresso é o valor atual desse ativo comparado com a meta.

**Para criar um objetivo:**
1. Clique em **+ Nova meta**
2. Preencha o nome, categoria, valor alvo e prioridade
3. Vincule um investimento (opcional — sem vínculo, o progresso ficará em zero)

**Prioridades disponíveis:** Muito Alta, Alta, Média, Baixa, Muito Baixa

O objetivo de maior prioridade que ainda não foi concluído aparece como "Missão atual" na visão geral.

Um objetivo é marcado como **concluído automaticamente** quando o investimento vinculado atinge 100% da meta — sem precisar fazer nada.

> **Atenção:** um investimento só pode estar vinculado a um objetivo por vez.

---

### Simulações

Permite projetar quanto seu patrimônio pode valer no futuro. Ajuste os sliders:

- **Patrimônio inicial** — quanto você tem hoje
- **Aporte mensal** — quanto pretende investir por mês
- **Rentabilidade anual** — a taxa anual esperada dos seus investimentos
- **Prazo** — por quantos anos quer simular

O resultado mostra:
- **Patrimônio projetado** ao final do período
- **Barra de composição** — separando o que você aportou do que os juros geraram
- **Gráfico de evolução** ano a ano

Você também pode comparar dois cenários de aporte lado a lado e ver a diferença no patrimônio final.

> O cálculo usa a fórmula correta de juros compostos com aportes mensais, com taxa mensal equivalente à taxa anual informada.

---

### Cronograma

Mostra a evolução real do seu patrimônio nos últimos meses (com base nas transações registradas) e uma projeção dos próximos 6 meses usando sua taxa de economia atual.

Meses sem nenhuma movimentação registrada aparecem como zero — isso é esperado, o Atlas só exibe o que ele realmente sabe.

---

### Estatísticas

Resumo rápido de totais: quanto você recebeu, quanto investiu, maior aporte registrado e sequência de meses investindo.

---

### Conquistas

Marcos desbloqueados automaticamente conforme você usa o Atlas. São 9 conquistas no total, baseadas em critérios reais como patrimônio acumulado, quantidade de ativos, objetivos criados e lançamentos registrados.

Conquistas bloqueadas aparecem acinzentadas com a descrição do que falta para desbloqueá-las.

---

### Perfil Financeiro

Seu perfil de usuário, com:

- **Nível e XP** — você ganha XP automaticamente a cada ação no Atlas (ver tabela abaixo)
- **Score financeiro** — calculado com base no seu patrimônio, diversificação de ativos, metas e nível
- **Missão ativa** — percentual de conclusão do objetivo principal
- **Conquistas desbloqueadas**

**Como ganhar XP:**

| Ação | XP ganho |
|------|----------|
| Registrar uma receita | 10 XP |
| Registrar uma despesa | 5 XP |
| Fazer um aporte | 20 XP |
| Fazer um resgate | 5 XP |
| Cadastrar um ativo | 30 XP |
| Criar um objetivo | 25 XP |

**Títulos por nível:**

| Nível | Título |
|-------|--------|
| 1–3 | Explorador |
| 4–6 | Construtor |
| 7–9 | Investidor |
| 10–14 | Estrategista |
| 15–19 | Mestre |
| 20+ | Lendário |

---

### Configurações

- **Seu nome** — como o Atlas vai te chamar na tela inicial
- **Exportar backup** — salva todos os seus dados em um arquivo `.json` no seu computador
- **Restaurar backup** — carrega um arquivo de backup gerado pelo Atlas

> **Importante:** restaurar um backup substitui **todos** os dados atuais. O Atlas pede confirmação antes de fazer isso.

---

## Como registrar uma movimentação

Clique em **+ Novo registro** (canto superior direito) em qualquer tela. Escolha o tipo:

- **Receita** — dinheiro que entrou (salário, freelance, etc.)
- **Aporte** — dinheiro que você colocou num investimento
- **Despesa** — dinheiro que saiu (contas, compras, etc.)

Preencha o valor, a categoria e uma descrição, depois clique em **Salvar registro**.

---

## Backup e segurança dos dados

Seus dados ficam em: `C:\Users\SeuNome\AppData\Roaming\Atlas\atlas.db`

**Recomendações:**
- Faça backup regularmente em Configurações → Exportar backup
- Guarde o arquivo em outro lugar (pen drive, nuvem pessoal)
- Use "Restaurar backup" caso troque de computador ou reinstale o app

---

## Perguntas frequentes

**O Atlas precisa de internet?**
Não. Tudo roda localmente no seu computador.

**Meus dados são enviados para algum servidor?**
Não. O Atlas não tem conta, login ou servidor externo. Tudo fica na sua máquina.

**Posso usar o Atlas em mais de um computador?**
Sim, mas os dados não sincronizam automaticamente. Use o backup para transferir os dados de uma máquina para outra.

**O app demorou para abrir, é normal?**
Sim, na primeira vez (ou após reiniciar o computador) pode levar alguns segundos. Ele está iniciando o banco de dados interno.

**Posso excluir um lançamento que fiz errado?**
Sim. Em Receitas ou Despesas, clique no ícone de lixeira ao lado do lançamento. O Atlas pede confirmação antes de excluir.

**O que é "Atualizar saldo" nos ativos?**
É para quando o valor do seu investimento mudou (rendeu ou caiu) e você quer refletir isso no Atlas sem criar um aporte ou resgate. Por exemplo, se seu Tesouro Selic foi de R$ 1.000 para R$ 1.045 no mês, você usa "Atualizar saldo" para registrar os R$ 1.045. O lucro/prejuízo é calculado automaticamente.
