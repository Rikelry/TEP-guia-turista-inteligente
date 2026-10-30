// Planejador de viagens: origem e destino com UF, sugestões a mais de 400 km (GPS + Haversine),
// combustão ou 100% elétrico, parâmetros de consumo e preço, duração e perfis do viajante.

import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { sugerirDestinos } from "../services/geolocation";
import type { Ponto } from "../services/geolocation";
import {
  ESTILOS_VIAGEM,
  LIMITES,
  UFS,
  ehCidadeValida,
  ehUFValida,
  sanitizarTexto,
} from "../types/schemas";
import type {
  Destino,
  EstiloViagem,
  PreferenciaRota,
  Propulsao,
  RoteiroRequest,
} from "../types/schemas";

export interface EstadoFormulario {
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
  propulsao: Propulsao;
  consumo_km_l: string;
  tanque_litros: string;
  preco_litro: string;
  eficiencia_km_kwh: string;
  bateria_kwh: string;
  preco_kwh: string;
  passageiros: string;
  dias_estadia: number;
  perfis: EstiloViagem[];
  preferencia_rota: PreferenciaRota;
}

export type CampoErro = keyof EstadoFormulario;
export type ErrosFormulario = Partial<Record<CampoErro, string>>;

export const ESTADO_INICIAL: EstadoFormulario = {
  origem_cidade: "",
  origem_uf: "PI",
  destino_cidade: "",
  destino_uf: "CE",
  propulsao: "combustao",
  consumo_km_l: "12",
  tanque_litros: "50",
  preco_litro: "6,20",
  eficiencia_km_kwh: "6,5",
  bateria_kwh: "60",
  preco_kwh: "1,20",
  passageiros: "1",
  dias_estadia: 1,
  perfis: ["cultural"],
  preferencia_rota: "rapida",
};

const paraNumero = (valor: string) => Number(valor.replace(",", "."));
const positivo = (valor: string) => Number.isFinite(paraNumero(valor)) && paraNumero(valor) > 0;

/** Mesmas regras do RoteiroRequest do backend (evita o 422). */
export function validarFormulario(e: EstadoFormulario): ErrosFormulario {
  const erros: ErrosFormulario = {};
  if (!ehCidadeValida(sanitizarTexto(e.origem_cidade)))
    erros.origem_cidade = "Informe uma cidade de origem válida.";
  if (!ehCidadeValida(sanitizarTexto(e.destino_cidade)))
    erros.destino_cidade = "Informe uma cidade de destino válida.";
  if (!ehUFValida(e.origem_uf)) erros.origem_uf = "Escolha a UF.";
  if (!ehUFValida(e.destino_uf)) erros.destino_uf = "Escolha a UF.";
  if (
    sanitizarTexto(e.origem_cidade).toLowerCase() ===
      sanitizarTexto(e.destino_cidade).toLowerCase() &&
    e.origem_uf === e.destino_uf
  ) {
    erros.destino_cidade = "O destino precisa ser diferente da origem.";
  }
  if (e.propulsao === "combustao") {
    if (!positivo(e.consumo_km_l)) erros.consumo_km_l = "Maior que zero.";
    if (!positivo(e.tanque_litros)) erros.tanque_litros = "Maior que zero.";
    if (!positivo(e.preco_litro)) erros.preco_litro = "Maior que zero.";
  } else {
    if (!positivo(e.eficiencia_km_kwh)) erros.eficiencia_km_kwh = "Maior que zero.";
    if (!positivo(e.bateria_kwh)) erros.bateria_kwh = "Maior que zero.";
    if (!(paraNumero(e.preco_kwh) >= 0)) erros.preco_kwh = "Não pode ser negativo.";
  }
  const p = paraNumero(e.passageiros);
  if (!Number.isInteger(p) || p < LIMITES.passageirosMin || p > LIMITES.passageirosMax) {
    erros.passageiros = `De ${LIMITES.passageirosMin} a ${LIMITES.passageirosMax} passageiros.`;
  }
  if (e.perfis.length === 0) erros.perfis = "Escolha pelo menos um perfil.";
  return erros;
}

/** Converte o formulário no corpo exato que o POST /planejar aceita. */
export function montarRequisicao(e: EstadoFormulario): RoteiroRequest {
  return {
    origem_cidade: sanitizarTexto(e.origem_cidade),
    origem_uf: e.origem_uf,
    destino_cidade: sanitizarTexto(e.destino_cidade),
    destino_uf: e.destino_uf,
    dias_estadia: e.dias_estadia,
    estilo_viagem: e.perfis[0] ?? "cultural",
    perfis: e.perfis,
    preferencia_rota: e.preferencia_rota,
    passageiros: Math.trunc(paraNumero(e.passageiros)),
    veiculo:
      e.propulsao === "combustao"
        ? {
            propulsao: "combustao",
            consumo_km_l: paraNumero(e.consumo_km_l),
            tanque_litros: paraNumero(e.tanque_litros),
            preco_litro: paraNumero(e.preco_litro),
          }
        : {
            propulsao: "eletrico",
            eficiencia_km_kwh: paraNumero(e.eficiencia_km_kwh),
            bateria_kwh: paraNumero(e.bateria_kwh),
            preco_kwh: paraNumero(e.preco_kwh),
          },
  };
}

export interface RoteiroFormProps {
  onEnviar: (pedido: RoteiroRequest) => void;
  carregando?: boolean;
  /** Catálogo de destinos (autocomplete e sugestões). */
  destinos?: Destino[];
  /** Posição do GPS, quando autorizada. */
  posicao?: Ponto | null;
  onPedirPosicao?: () => void;
  buscandoPosicao?: boolean;
  /** UFs onde existe a cidade digitada (IBGE + catálogo); usado para corrigir o UF. */
  ufsDaCidade?: (cidade: string) => string[];
}

export function RoteiroForm({
  onEnviar,
  carregando = false,
  destinos = [],
  posicao = null,
  onPedirPosicao,
  buscandoPosicao = false,
  ufsDaCidade,
}: RoteiroFormProps) {
  const [estado, setEstado] = useState<EstadoFormulario>(ESTADO_INICIAL);
  const [erros, setErros] = useState<ErrosFormulario>({});
  const [enviado, setEnviado] = useState(false);
  // Aviso de UF corrigido automaticamente, por campo.
  const [avisoUf, setAvisoUf] = useState<{ origem?: string; destino?: string }>({});
  const id = useId();

  const atualizar = <K extends CampoErro>(campo: K, valor: EstadoFormulario[K]) => {
    const proximo = { ...estado, [campo]: valor };
    setEstado(proximo);
    if (enviado) setErros(validarFormulario(proximo));
  };

  // Ponto de partida: a cidade de origem do catálogo; se não estiver lá, o GPS.
  const pontoPartida = useMemo<Ponto | null>(() => {
    const origem = destinos.find(
      (d) =>
        d.uf === estado.origem_uf &&
        d.cidade.toLowerCase() === estado.origem_cidade.trim().toLowerCase(),
    );
    return origem ?? posicao;
  }, [destinos, estado.origem_cidade, estado.origem_uf, posicao]);

  const sugestoes = useMemo(
    () => (pontoPartida ? sugerirDestinos(pontoPartida, destinos) : []),
    [pontoPartida, destinos],
  );

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    setEnviado(true);
    const encontrados = validarFormulario(estado);
    setErros(encontrados);
    if (Object.keys(encontrados).length === 0 && !carregando) onEnviar(montarRequisicao(estado));
  };

  const campo = (
    nome: CampoErro,
    rotulo: string,
    props: { inputMode?: "decimal" | "numeric"; sufixo?: string } = {},
  ) => (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-${nome}`}>
        {rotulo}
      </label>
      <input
        id={`${id}-${nome}`}
        className="field__control"
        inputMode={props.inputMode ?? "decimal"}
        value={String(estado[nome])}
        aria-invalid={Boolean(erros[nome])}
        aria-describedby={erros[nome] ? `${id}-${nome}-erro` : undefined}
        onChange={(e) => atualizar(nome, e.target.value as never)}
      />
      {erros[nome] && (
        <span className="field__error" id={`${id}-${nome}-erro`}>
          {erros[nome]}
        </span>
      )}
    </div>
  );

  const cidadeComUf = (lado: "origem" | "destino", rotulo: string) => {
    const nomeCidade = `${lado}_cidade` as const;
    const nomeUf = `${lado}_uf` as const;
    return (
      <div className="form-cidade">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-${nomeCidade}`}>
            {rotulo}
          </label>
          <input
            id={`${id}-${nomeCidade}`}
            className="field__control"
            list={`${id}-cidades`}
            autoComplete="off"
            placeholder={lado === "origem" ? "Ex.: Piripiri" : "Ex.: Jijoca de Jericoacoara"}
            value={estado[nomeCidade]}
            aria-invalid={Boolean(erros[nomeCidade])}
            aria-describedby={erros[nomeCidade] ? `${id}-${nomeCidade}-erro` : undefined}
            onChange={(e) => {
              const valor = e.target.value;
              // Cidade conhecida: corrige o UF. Se o nome existe em vários estados, mantém o UF
              // escolhido quando ele é um deles e avisa as opções.
              const ufs = ufsDaCidade?.(valor) ?? [];
              const ufAtual = estado[nomeUf];
              const ufNovo = ufs.length && !ufs.includes(ufAtual) ? ufs[0]! : ufAtual;
              const proximo = { ...estado, [nomeCidade]: valor, [nomeUf]: ufNovo };
              setEstado(proximo);
              setAvisoUf((atual) => ({
                ...atual,
                [lado]:
                  ufs.length > 1
                    ? `Existe em ${ufs.join(", ")}. Confira o UF.`
                    : ufNovo !== ufAtual
                      ? `UF corrigido para ${ufNovo}.`
                      : undefined,
              }));
              if (enviado) setErros(validarFormulario(proximo));
            }}
          />
          {avisoUf[lado] && !erros[nomeCidade] && (
            <span className="field__hint" role="status">
              {avisoUf[lado]}
            </span>
          )}
          {erros[nomeCidade] && (
            <span className="field__error" id={`${id}-${nomeCidade}-erro`}>
              {erros[nomeCidade]}
            </span>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-${nomeUf}`}>
            UF
          </label>
          <select
            id={`${id}-${nomeUf}`}
            className="field__control"
            value={estado[nomeUf]}
            aria-invalid={Boolean(erros[nomeUf])}
            onChange={(e) => atualizar(nomeUf, e.target.value)}
          >
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const eletrico = estado.propulsao === "eletrico";

  return (
    <form className="card planejador" onSubmit={enviar} noValidate aria-labelledby={`${id}-titulo`}>
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-rota" />
        </svg>
        <div>
          <h2 className="card__title" id={`${id}-titulo`}>
            Planejar viagem
          </h2>
          <p className="card__subtitle">
            Roteiro inteligente com mapa rodoviário, paradas e custos.
          </p>
        </div>
      </div>

      <datalist id={`${id}-cidades`}>
        {destinos.map((d) => (
          <option key={`${d.cidade}-${d.uf}`} value={d.cidade}>
            {d.uf}
          </option>
        ))}
      </datalist>

      <div className="lista lista--folgada">
        {cidadeComUf("origem", "Cidade de origem")}
        {cidadeComUf("destino", "Cidade de destino")}

        <div className="sugestoes" aria-live="polite">
          <div className="sugestoes__topo">
            <span className="fieldset__legend">Sugestões (acima de 400 km)</span>
            {onPedirPosicao && !posicao && (
              <button
                type="button"
                className="btn btn--link"
                onClick={onPedirPosicao}
                disabled={buscandoPosicao}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-pin" />
                </svg>
                {buscandoPosicao ? "Localizando..." : "Usar minha localização"}
              </button>
            )}
          </div>
          {sugestoes.length > 0 ? (
            <div className="chip-row">
              {sugestoes.map((s) => {
                const ativa = estado.destino_cidade === s.cidade && estado.destino_uf === s.uf;
                return (
                  <button
                    key={`${s.cidade}-${s.uf}`}
                    type="button"
                    className="chip chip--sugestao"
                    aria-pressed={ativa}
                    onClick={() => {
                      const proximo = { ...estado, destino_cidade: s.cidade, destino_uf: s.uf };
                      setEstado(proximo);
                      if (enviado) setErros(validarFormulario(proximo));
                    }}
                  >
                    <span aria-hidden="true">🚗</span> {s.cidade} ({s.uf})
                    <span className="chip__km">{s.distanciaKm} km</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="field__hint">
              Digite uma cidade de origem do catálogo ou use sua localização para ver destinos a
              mais de 400 km.
            </p>
          )}
        </div>

        <fieldset className="fieldset">
          <legend className="fieldset__legend">Tipo de veículo</legend>
          <div className="veiculos" role="radiogroup">
            {(
              [
                ["combustao", "Combustão", "Gasolina, etanol ou diesel", "ic-combustivel"],
                ["eletrico", "100% Elétrico", "Eletropostos e recarga", "ic-raio"],
              ] as const
            ).map(([valor, titulo, descricao, icone]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={estado.propulsao === valor}
                className="veiculo"
                onClick={() => atualizar("propulsao", valor)}
              >
                <svg className="icon icon--lg" aria-hidden="true">
                  <use href={`/icons.svg#${icone}`} />
                </svg>
                <span>
                  <span className="veiculo__titulo">{titulo}</span>
                  <span className="veiculo__desc">{descricao}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <details className="parametros">
          <summary>
            <svg className="icon" aria-hidden="true">
              <use href="/icons.svg#ic-chevron" />
            </svg>
            Personalizar parâmetros de consumo e preço
          </summary>
          <div className="form-grid parametros__grid">
            {eletrico ? (
              <>
                {campo("eficiencia_km_kwh", "Eficiência (km/kWh)")}
                {campo("bateria_kwh", "Bateria (kWh)")}
                {campo("preco_kwh", "Preço do kWh (R$)")}
              </>
            ) : (
              <>
                {campo("consumo_km_l", "Consumo (km/L)")}
                {campo("tanque_litros", "Tanque (L)")}
                {campo("preco_litro", "Preço do litro (R$)")}
              </>
            )}
            {campo("passageiros", "Passageiros (até 8)", { inputMode: "numeric" })}
            <div className="field field--full">
              <span className="field__label">Preferência de rota</span>
              <div className="segmented" role="radiogroup" aria-label="Preferência de rota">
                {(
                  [
                    ["rapida", "Mais rápida"],
                    ["economica", "Mais econômica"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={estado.preferencia_rota === valor}
                    aria-pressed={estado.preferencia_rota === valor}
                    className="segmented__option"
                    onClick={() => atualizar("preferencia_rota", valor)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {(erros.consumo_km_l || erros.eficiencia_km_kwh || erros.passageiros) && (
            <p className="field__error">Confira os parâmetros do veículo.</p>
          )}
        </details>

        <div className="painel-escolhas">
          <fieldset className="fieldset">
            <legend className="fieldset__legend">Duração da viagem</legend>
            <div className="chip-row" role="radiogroup">
              {Array.from({ length: LIMITES.diasMax }, (_, i) => i + 1).map((dias) => (
                <button
                  key={dias}
                  type="button"
                  role="radio"
                  className="chip"
                  aria-checked={estado.dias_estadia === dias}
                  aria-pressed={estado.dias_estadia === dias}
                  onClick={() => atualizar("dias_estadia", dias)}
                >
                  {dias} {dias === 1 ? "dia" : "dias"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset__legend">Perfil do viajante (de 1 a todos)</legend>
            <div className="chip-row">
              {ESTILOS_VIAGEM.map(({ valor, rotulo, emoji }) => {
                const marcado = estado.perfis.includes(valor);
                return (
                  <button
                    key={valor}
                    type="button"
                    className="chip"
                    aria-pressed={marcado}
                    onClick={() =>
                      atualizar(
                        "perfis",
                        marcado
                          ? estado.perfis.filter((p) => p !== valor)
                          : [...estado.perfis, valor],
                      )
                    }
                  >
                    <span aria-hidden="true">{emoji}</span> {rotulo}
                  </button>
                );
              })}
            </div>
            {erros.perfis && <span className="field__error">{erros.perfis}</span>}
          </fieldset>
        </div>

        <button
          type="submit"
          className="btn btn--primary btn--block btn--grande"
          disabled={carregando}
          aria-busy={carregando}
        >
          {carregando ? (
            <span className="btn__spinner" aria-hidden="true" />
          ) : (
            <svg className="icon" aria-hidden="true">
              <use href="/icons.svg#ic-rota" />
            </svg>
          )}
          {carregando ? "Planejando..." : "Planejar viagem"}
        </button>
      </div>
    </form>
  );
}

export default RoteiroForm;
