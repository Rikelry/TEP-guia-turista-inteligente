# 🇧🇷 Guia do Turista Inteligente (Flask + HTTPX + Google Auth + Gemini AI)

Aplicação web desenvolvida com o microframework **Flask** e Python moderno para orquestração de APIs externas com autenticação via **Google Identity Services (OAuth JWT)**, gerando roteiros de viagem com dados meteorológicos, cálculo de percurso rodoviário e guia turístico & culinário com inteligência artificial.

---

## 🚀 Como Executar o Projeto Localmente

### 1. Clonar o Repositório e Acessar a Pasta

```bash
git clone https://github.com/Rikelry/TEP-guia-turista-inteligente.git
cd TEP-guia-turista-inteligente
```

---

## 2. Criar e Ativar o Ambiente Virtual (`.venv`)

* **Linux/macOS (Bash/Zsh)**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

* **Windows (PowerShell)**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

---

### 3. Instalar as Dependências

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

---

### 4. Configurar as Chaves e Variáveis de Ambiente

Configure as variáveis no seu terminal:

* **Linux/macOS (Bash/Zsh)**
```bash
export GEMINI_API_KEY="SUA_CHAVE_GEMINI_AQUI"
export GOOGLE_CLIENT_ID="776335673676-dk7od4ljhh43bio4bppf94i8ou0u9v9i.apps.googleusercontent.com"
export PORT="8001"
```

* **Windows (PowerShell)**
```powershell
$env:GEMINI_API_KEY="SUA_CHAVE_GEMINI_AQUI"
$env:GOOGLE_CLIENT_ID="776335673676-dk7od4ljhh43bio4bppf94i8ou0u9v9i.apps.googleusercontent.com"
$env:PORT="8001"
```

> **Obtenção da Chave Gemini:** Acesse o [Google AI Studio](https://aistudio.google.com/), crie sua chave e defina na variável `GEMINI_API_KEY`.

---

### 5. Iniciar o Servidor Flask

```bash
python app.py
```

Acesse a aplicação no navegador em:  
👉 **`http://localhost:8001`**

---

## 📂 Estrutura do Projeto

```text
.
├── app.py                      # [A IMPLEMENTAR] Aplicação Flask (Autenticação Google no Python com Sessão, SSR e Rotas)
├── config.py                   # Constantes, UFs do Brasil, Client ID do Google e variáveis de ambiente
├── planejamento.py             # [A IMPLEMENTAR] Módulo de IA Gemini para geração de guia turístico e gastronomia
├── README.md                   # Documentação e instruções de execução
├── requirements.txt            # Lista de dependências Python
├── services.py                 # [A IMPLEMENTAR] Integrações com APIs externas via HTTPX (Open-Meteo, OSRM e validação de token Google OAuth)
├── static
│   ├── css
│   │   └── style.css           # Estilização responsiva em CSS
│   ├── data
│   │   ├── estados_brasil.json # Mapeamento oficial das 27 UFs do Brasil
│   │   └── viagens.json        # Persistência em JSON dos roteiros dos usuários logados
│   └── js
│       └── app.js              # Comportamento de interface (Accordion e bloqueio de cliques)
└── templates
    └── index.html              # Frontend Server-Side Rendering (Jinja2, Google Login URI, Cards e Accordion)
```

---

## 🧪 Qualidade de Código e Linter

Para validar o código com as ferramentas da disciplina:

```bash
# Formatação e checagem de boas práticas (PEP 8)
ruff check . --fix

# Checagem estática de tipos (Type Hints)
mypy app.py services.py planejamento.py config.py
```
