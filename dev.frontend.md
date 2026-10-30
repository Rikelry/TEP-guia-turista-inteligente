DEV 1

Frontend e UI/UX

# Interface e experiência visual

Responsável pela construção dos componentes visuais, responsividade, acessibilidade e apresentação das informações ao usuário.

1. Componentes (`src/components/`)

- `Header.jsx`: Barra superior, alternância de tema e apresentação do usuário.
    
- `RoteiroForm.jsx`: Interface do formulário de planejamento de viagens.
    
- `MapaRota.jsx`: Exibição visual do mapa, rotas, marcadores e paradas.
    
- `RoteiroResult.jsx`: Apresentação dos resultados, clima, guia turístico e atrativos.
    
- `TelemetriaCard.jsx`: Interface visual das métricas de desempenho.
    
- `HistoricoViagens.jsx`: Listagem visual do histórico de viagens.
    
- `BotoesControleViagem.jsx`: Botões de exportação, compartilhamento e navegação.
    
- `ErrorBoundary.jsx`: Interface de tratamento de erros.
    
- `Toast.jsx`: Notificações visuais e acessíveis.
    
- `Footer.jsx`: Rodapé semântico.
    

2. Estilização e identidade visual

- `src/index.css`: Design System, tokens, temas e responsividade.
    
- `src/assets/`: Imagens e ilustrações.
    
- `public/favicon.svg`: Ícone da aplicação.
    
- `public/icons.svg`: Sprite de ícones.
    
- `index.html`: Estrutura HTML, metadados e integração visual com Leaflet.
    

3. Testes de interface

- Testes dos componentes visuais.
    
- Testes de responsividade e acessibilidade.
    
- Testes de interação dos formulários.
    
- Testes de renderização de mapas e resultados.
    











DEV 2

Lógica e integração

# Regras de negócio e gerenciamento de dados

Responsável pela lógica da aplicação, comunicação com o backend, autenticação, persistência e processamento das informações.

1. Hooks (`src/hooks/`)

- `useAuth.ts`: Autenticação Google e sessão de visitante.
- `useTheme.ts`: Gerenciamento e persistência dos temas.
- `useToasts.ts`: Gerenciamento global das notificações.
- `useNetworkStatus.ts`: Monitoramento de conexão online/offline.
- `useSessionTimer.ts`: Controle da expiração da sessão de visitante.
- `useViagem.ts`: Gerenciamento centralizado do planejamento, custos, telemetria e histórico.

2. Serviços (`src/services/`)

- `api.ts`: Comunicação REST, autenticação, latência e streaming SSE.
- `geolocation.ts`: GPS, coordenadas e cálculo de Haversine.
- `visitanteStorage.ts`: Persistência e gerenciamento do localStorage.

3. Validação e configuração

- `src/types/schemas.ts`: Validação e sanitização dos dados.
- `config.ts`: Configurações da aplicação e variáveis de ambiente.
- `.env.example`: Modelo das variáveis de ambiente.
    

4. Estrutura e integração

- `App.tsx`: Orquestração global e integração dos componentes.
- `main.tsx`: Inicialização da aplicação React.
- `vite.config.ts`: Configuração do Vite.
- `package.json`: Dependências e scripts.
- `setupTests.ts`: Configuração do Vitest.

5. Testes de lógica

- Testes dos hooks.
- Testes dos serviços e chamadas REST.
- Testes de autenticação e sessões.
- Testes de validação de dados.
- Testes de streaming SSE.













# Divisão das funcionalidades específicas

Algumas funcionalidades exigem colaboração entre os dois desenvolvedores. A separação deve acontecer entre processamento e apresentação.

|Funcionalidade|Dev 1|Dev 2|
|---|---|---|
|Formulário de roteiro|Interface e campos|Validações e cálculos|
|GPS e proximidade|Exibição das sugestões|Geolocalização e Haversine|
|Mapa Leaflet|Renderização visual|Dados de rotas e paradas|
|Custos de viagem|Painel de custos|Cálculos de combustível e EV|
|Altimetria|Gráfico e apresentação|Processamento dos dados|
|Guia com IA|Interface de streaming|Consumo SSE da API|
|Autenticação Google|Botão e estado visual|Controle da autenticação|
|Histórico|Lista e exclusão visual|Persistência e chamadas REST|
|Telemetria|Cards e indicadores|Captura e processamento|
|Exportação GPX|Botão de download|Geração do arquivo GPX|
|Temas|Aparência e CSS|Persistência do tema|

# Organização dos arquivos por desenvolvedor

Para facilitar o acompanhamento, esta seria a divisão oficial:

```
frontend/
│
├── DEV 1 - INTERFACE E UI/UX
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   │
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── RoteiroForm.jsx
│   │   │   ├── MapaRota.jsx
│   │   │   ├── RoteiroResult.jsx
│   │   │   ├── TelemetriaCard.jsx
│   │   │   ├── HistoricoViagens.jsx
│   │   │   ├── BotoesControleViagem.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── Toast.jsx
│   │   │   └── Footer.jsx
│   │   │
│   │   └── index.css
│   │
│   └── index.html
│
└── DEV 2 - LÓGICA E INTEGRAÇÃO
    ├── src/
    │   ├── hooks/
    │   │   ├── useAuth.js
    │   │   ├── useTheme.js
    │   │   ├── useToasts.js
    │   │   ├── useNetworkStatus.js
    │   │   ├── useSessionTimer.js
    │   │   └── useViagem.js
    │   │
    │   ├── services/
    │   │   ├── api.js
    │   │   ├── geolocation.js
    │   │   └── visitanteStorage.js
    │   │
    │   ├── types/
    │   │   └── schemas.js
    │   │
    │   ├── App.jsx
    │   ├── config.js
    │   ├── setupTests.js
    │   └── main.jsx
    │
    ├── vite.config.js
    ├── package.json
    └── .env.example
```

# Como os dois desenvolvedores devem trabalhar juntos

Para evitar conflitos e retrabalho, recomendo estabelecer quatro regras:

1. Definir contratos antes de desenvolver

O Dev 2 deve disponibilizar os contratos de dados e as funções que os componentes utilizarão. Por exemplo:

```
// Exemplo de contrato entre os desenvolvedores

const viagem = {
  origem: {},
  destino: {},
  veiculo: {},
  rota: {},
  custos: {},
  clima: {},
  atrativos: [],
  telemetria: {}
};
```

2. O Dev 1 não deve implementar chamadas diretas à API.

Os componentes devem receber dados e callbacks por propriedades (`props`) ou utilizar os hooks compartilhados definidos pela equipe.

3. O Dev 2 não deve depender da interface visual para desenvolver a lógica.

Ele pode utilizar dados simulados (mocks) para testar os serviços, hooks e cálculos.

4. Integração contínua.

Os dois devem trabalhar na mesma branch de desenvolvimento ou em branches individuais, integrando as alterações por Pull Requests.

# Divisão de entregas

|Etapa|Dev 1|Dev 2|
|---|---|---|
|1. Estrutura inicial|Componentes e CSS base|Configuração e serviços|
|2. Planejamento|Formulário e mapa visual|GPS, Haversine e cálculos|
|3. Resultados|Cards, guia e atrativos|API e streaming SSE|
|4. Usuário|Header e histórico visual|Autenticação e persistência|
|5. Finalização|Responsividade e acessibilidade|Integração e validações|
|6. Testes|Testes de interface|Testes de lógica e integração|

Ponto importante: arquivos compartilhados

Alguns arquivos precisam de alinhamento entre os desenvolvedores:

- `App.jsx`: Dev 2 coordena a integração, com participação do Dev 1.
    
- `useTheme.js` e `index.css`: Dev 2 implementa a persistência; Dev 1 implementa a aparência.
    
- `useToasts.js` e `Toast.jsx`: Dev 2 implementa a lógica; Dev 1 implementa a interface.
    
- `MapaRota.jsx` e `useViagem.js`: Dev 1 implementa a visualização; Dev 2 fornece os dados e cálculos.
    

Isso evita que os dois alterem o mesmo arquivo sem combinar previamente.

Minha recomendação: essa divisão é adequada para dois desenvolvedores porque separa a camada de apresentação da camada de lógica, mas mantém a colaboração nas funcionalidades mais complexas. O principal cuidado é definir os contratos de dados e as interfaces dos hooks antes de começar a implementação. Assim, os dois podem trabalhar em paralelo sem ficar esperando um pelo outro.