// Formulário de planejamento de viagem: origem/destino, veículo, perfil e rota.
// Validação client-side espelhando as regras do schema Pydantic do backend.

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { ESTILOS_VIAGEM } from "../types/schemas";
import type { EstiloViagem, PreferenciaRota, Propulsao, RoteiroRequest } from "../types/schemas";

export interface EstadoFormulario {
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
  propulsao: Propulsao;
  consumo_km_l: string;
  capacidade_tanque_l: string;
  preco_litro: string;
  eficiencia_km_kwh: string;
  capacidade_bateria_kwh: string;
  preco_kwh: string;
  dias_estadia: string;
  passageiros: string;
  estilo_viagem: EstiloViagem;
  preferencia_rota: PreferenciaRota;
}

export type ErrosRoteiro = Partial<Record<keyof RoteiroRequest, string>>;

export const ESTADO_INICIAL: EstadoFormulario = {
  origem_cidade: "",
  origem_uf: "",
  destino_cidade: "",
  destino_uf: "",
  propulsao: "combustao",
  consumo_km_l: "12",
  capacidade_tanque_l: "50",
  preco_litro: "5.89",
  eficiencia_km_kwh: "6",
  capacidade_bateria_kwh: "60",
  preco_kwh: "0.95",
  dias_estadia: "3",
  passageiros: "2",
  estilo_viagem: "cultural",
  preferencia_rota: "rapida",
};

function paraNumero(valor: string): number {
  return Number(valor.replace(",", "."));
}

/** Valida o estado do formulário e devolve os erros por campo. */
export function validarRoteiro(estado: EstadoFormulario): ErrosRoteiro {
  const erros: ErrosRoteiro = {};

  if (estado.origem_cidade.trim().length < 2) {
    erros.origem_cidade = "Informe a cidade de origem.";
  }
  if (estado.destino_cidade.trim().length < 2) {
    erros.destino_cidade = "Informe a cidade de destino.";
  }
  if (!/^[a-zA-Z]{2}$/.test(estado.origem_uf.trim())) {
    erros.origem_uf = "Use a sigla da UF (ex.: SP).";
  }
  if (!/^[a-zA-Z]{2}$/.test(estado.destino_uf.trim())) {
    erros.destino_uf = "Use a sigla da UF (ex.: RJ).";
  }

  if (estado.propulsao === "combustao") {
    if (!(paraNumero(estado.consumo_km_l) > 0)) {
      erros.consumo_km_l = "Consumo deve ser maior que zero.";
    }
    if (!(paraNumero(estado.capacidade_tanque_l) > 0)) {
      erros.capacidade_tanque_l = "Informe a capacidade do tanque.";
    }
    if (paraNumero(estado.preco_litro) < 0) {
      erros.preco_litro = "O preço não pode ser negativo.";
    }
  } else {
    if (!(paraNumero(estado.eficiencia_km_kwh) > 0)) {
      erros.eficiencia_km_kwh = "Eficiência deve ser maior que zero.";
    }
    if (!(paraNumero(estado.capacidade_bateria_kwh) > 0)) {
      erros.capacidade_bateria_kwh = "Informe a capacidade da bateria.";
    }
    if (paraNumero(estado.preco_kwh) < 0) {
      erros.preco_kwh = "O preço não pode ser negativo.";
    }
  }

  const dias = paraNumero(estado.dias_estadia);
  if (!Number.isInteger(dias) || dias < 1) {
    erros.dias_estadia = "Informe ao menos 1 dia de estadia.";
  }
  const passageiros = paraNumero(estado.passageiros);
  if (!Number.isInteger(passageiros) || passageiros < 1) {
    erros.passageiros = "Informe ao menos 1 passageiro.";
  }

  return erros;
}

/** Converte o estado do formulário no payload tipado enviado ao backend. */
export function montarRequisicao(estado: EstadoFormulario): RoteiroRequest {
  return {
    origem_cidade: estado.origem_cidade.trim(),
    origem_uf: estado.origem_uf.trim().toUpperCase(),
    destino_cidade: estado.destino_cidade.trim(),
    destino_uf: estado.destino_uf.trim().toUpperCase(),
    propulsao: estado.propulsao,
    consumo_km_l: paraNumero(estado.consumo_km_l),
    capacidade_tanque_l: paraNumero(estado.capacidade_tanque_l),
    preco_litro: paraNumero(estado.preco_litro),
    eficiencia_km_kwh: paraNumero(estado.eficiencia_km_kwh),
    capacidade_bateria_kwh: paraNumero(estado.capacidade_bateria_kwh),
    preco_kwh: paraNumero(estado.preco_kwh),
    dias_estadia: Math.trunc(paraNumero(estado.dias_estadia)),
    estilo_viagem: estado.estilo_viagem,
    preferencia_rota: estado.preferencia_rota,
    passageiros: Math.trunc(paraNumero(estado.passageiros)),
  };
}

export interface RoteiroFormProps {
  onEnviar: (dados: RoteiroRequest) => void;
  carregando?: boolean;
  desabilitado?: boolean;
  valoresIniciais?: Partial<EstadoFormulario>;
}

export function RoteiroForm({
  onEnviar,
  carregando = false,
  desabilitado = false,
  valoresIniciais,
}: RoteiroFormProps) {
  const [estado, setEstado] = useState<EstadoFormulario>({
    ...ESTADO_INICIAL,
    ...valoresIniciais,
  });
  const [erros, setErros] = useState<ErrosRoteiro>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (Object.keys(erros).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [erros]);

  const trocarCampo = <C extends keyof EstadoFormulario>(
    campo: C,
    valor: EstadoFormulario[C],
  ): void => {
    setEstado((atual) => ({ ...atual, [campo]: valor }));
    if (erros[campo as keyof RoteiroRequest]) {
      setErros((atual) => {
        const proximo = { ...atual };
        delete proximo[campo as keyof RoteiroRequest];
        return proximo;
      });
    }
  };

  const enviar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    const novosErros = validarRoteiro(estado);
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;
    onEnviar(montarRequisicao(estado));
  };

  const invalido = (campo: keyof RoteiroRequest): "true" | undefined =>
    erros[campo] ? "true" : undefined;

  const mensagem = (campo: keyof RoteiroRequest) =>
    erros[campo] ? (
      <p className="field__error" id={`erro-${campo}`} role="alert">
        <svg className="icon" aria-hidden="true">
          <use href="/icons.svg#ic-aviso" />
        </svg>
        {erros[campo]}
      </p>
    ) : null;

  const combustao = estado.propulsao === "combustao";
  const autonomia = combustao
    ? paraNumero(estado.consumo_km_l) * paraNumero(estado.capacidade_tanque_l)
    : paraNumero(estado.eficiencia_km_kwh) * paraNumero(estado.capacidade_bateria_kwh);
  const autonomiaValida = Number.isFinite(autonomia) && autonomia > 0;

  return (
    <form
      className="card"
      ref={formRef}
      noValidate
      onSubmit={enviar}
      aria-busy={carregando}
      aria-label="Planejamento de viagem"
    >
      <div className="card__header">
        <svg className="icon icon--lg" aria-hidden="true">
          <use href="/icons.svg#ic-rota" />
        </svg>
        <div>
          <h2 className="card__title">Planejar viagem</h2>
          <p className="card__subtitle">
            Informe origem, destino, veículo e perfil para gerar o roteiro.
          </p>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="field__label" htmlFor="origem_cidade">
            Cidade de origem
          </label>
          <input
            id="origem_cidade"
            name="origem_cidade"
            className="field__control"
            value={estado.origem_cidade}
            onChange={(e) => trocarCampo("origem_cidade", e.target.value)}
            aria-invalid={invalido("origem_cidade")}
            aria-describedby={erros.origem_cidade ? "erro-origem_cidade" : undefined}
            autoComplete="address-level2"
            disabled={desabilitado}
          />
          {mensagem("origem_cidade")}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="origem_uf">
            UF de origem
          </label>
          <input
            id="origem_uf"
            name="origem_uf"
            className="field__control"
            value={estado.origem_uf}
            onChange={(e) => trocarCampo("origem_uf", e.target.value.toUpperCase().slice(0, 2))}
            aria-invalid={invalido("origem_uf")}
            aria-describedby={erros.origem_uf ? "erro-origem_uf" : undefined}
            maxLength={2}
            placeholder="SP"
            disabled={desabilitado}
          />
          {mensagem("origem_uf")}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="destino_cidade">
            Cidade de destino
          </label>
          <input
            id="destino_cidade"
            name="destino_cidade"
            className="field__control"
            value={estado.destino_cidade}
            onChange={(e) => trocarCampo("destino_cidade", e.target.value)}
            aria-invalid={invalido("destino_cidade")}
            aria-describedby={erros.destino_cidade ? "erro-destino_cidade" : undefined}
            autoComplete="address-level2"
            disabled={desabilitado}
          />
          {mensagem("destino_cidade")}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="destino_uf">
            UF de destino
          </label>
          <input
            id="destino_uf"
            name="destino_uf"
            className="field__control"
            value={estado.destino_uf}
            onChange={(e) => trocarCampo("destino_uf", e.target.value.toUpperCase().slice(0, 2))}
            aria-invalid={invalido("destino_uf")}
            aria-describedby={erros.destino_uf ? "erro-destino_uf" : undefined}
            maxLength={2}
            placeholder="RJ"
            disabled={desabilitado}
          />
          {mensagem("destino_uf")}
        </div>

        <div className="field field--full">
          <fieldset className="fieldset">
            <legend className="fieldset__legend">Propulsão do veículo</legend>
            <div className="segmented">
              <button
                type="button"
                className="segmented__option"
                aria-pressed={combustao}
                onClick={() => trocarCampo("propulsao", "combustao")}
                disabled={desabilitado}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-carro" />
                </svg>
                Combustão
              </button>
              <button
                type="button"
                className="segmented__option"
                aria-pressed={!combustao}
                onClick={() => trocarCampo("propulsao", "eletrico")}
                disabled={desabilitado}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-raio" />
                </svg>
                Elétrico
              </button>
            </div>
          </fieldset>
        </div>

        {combustao ? (
          <>
            <div className="field">
              <label className="field__label" htmlFor="consumo_km_l">
                Consumo (km/L)
              </label>
              <input
                id="consumo_km_l"
                name="consumo_km_l"
                className="field__control"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={estado.consumo_km_l}
                onChange={(e) => trocarCampo("consumo_km_l", e.target.value)}
                aria-invalid={invalido("consumo_km_l")}
                aria-describedby={erros.consumo_km_l ? "erro-consumo_km_l" : undefined}
                disabled={desabilitado}
              />
              {mensagem("consumo_km_l")}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="capacidade_tanque_l">
                Capacidade do tanque (L)
              </label>
              <input
                id="capacidade_tanque_l"
                name="capacidade_tanque_l"
                className="field__control"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={estado.capacidade_tanque_l}
                onChange={(e) => trocarCampo("capacidade_tanque_l", e.target.value)}
                aria-invalid={invalido("capacidade_tanque_l")}
                aria-describedby={
                  erros.capacidade_tanque_l ? "erro-capacidade_tanque_l" : undefined
                }
                disabled={desabilitado}
              />
              {mensagem("capacidade_tanque_l")}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="preco_litro">
                Preço do litro (R$)
              </label>
              <input
                id="preco_litro"
                name="preco_litro"
                className="field__control"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={estado.preco_litro}
                onChange={(e) => trocarCampo("preco_litro", e.target.value)}
                aria-invalid={invalido("preco_litro")}
                aria-describedby={erros.preco_litro ? "erro-preco_litro" : undefined}
                disabled={desabilitado}
              />
              {mensagem("preco_litro")}
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label className="field__label" htmlFor="eficiencia_km_kwh">
                Eficiência (km/kWh)
              </label>
              <input
                id="eficiencia_km_kwh"
                name="eficiencia_km_kwh"
                className="field__control"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={estado.eficiencia_km_kwh}
                onChange={(e) => trocarCampo("eficiencia_km_kwh", e.target.value)}
                aria-invalid={invalido("eficiencia_km_kwh")}
                aria-describedby={erros.eficiencia_km_kwh ? "erro-eficiencia_km_kwh" : undefined}
                disabled={desabilitado}
              />
              {mensagem("eficiencia_km_kwh")}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="capacidade_bateria_kwh">
                Capacidade da bateria (kWh)
              </label>
              <input
                id="capacidade_bateria_kwh"
                name="capacidade_bateria_kwh"
                className="field__control"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={estado.capacidade_bateria_kwh}
                onChange={(e) => trocarCampo("capacidade_bateria_kwh", e.target.value)}
                aria-invalid={invalido("capacidade_bateria_kwh")}
                aria-describedby={
                  erros.capacidade_bateria_kwh ? "erro-capacidade_bateria_kwh" : undefined
                }
                disabled={desabilitado}
              />
              {mensagem("capacidade_bateria_kwh")}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="preco_kwh">
                Preço do kWh (R$)
              </label>
              <input
                id="preco_kwh"
                name="preco_kwh"
                className="field__control"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={estado.preco_kwh}
                onChange={(e) => trocarCampo("preco_kwh", e.target.value)}
                aria-invalid={invalido("preco_kwh")}
                aria-describedby={erros.preco_kwh ? "erro-preco_kwh" : undefined}
                disabled={desabilitado}
              />
              {mensagem("preco_kwh")}
            </div>
          </>
        )}

        {autonomiaValida && (
          <p className="field__hint field--full">
            Autonomia estimada: {Math.round(autonomia)} km por
            {combustao ? " tanque" : " carga"}.
          </p>
        )}

        <div className="field">
          <label className="field__label" htmlFor="dias_estadia">
            Dias de estadia
          </label>
          <input
            id="dias_estadia"
            name="dias_estadia"
            className="field__control"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={estado.dias_estadia}
            onChange={(e) => trocarCampo("dias_estadia", e.target.value)}
            aria-invalid={invalido("dias_estadia")}
            aria-describedby={erros.dias_estadia ? "erro-dias_estadia" : undefined}
            disabled={desabilitado}
          />
          {mensagem("dias_estadia")}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="passageiros">
            Passageiros
          </label>
          <input
            id="passageiros"
            name="passageiros"
            className="field__control"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={estado.passageiros}
            onChange={(e) => trocarCampo("passageiros", e.target.value)}
            aria-invalid={invalido("passageiros")}
            aria-describedby={erros.passageiros ? "erro-passageiros" : undefined}
            disabled={desabilitado}
          />
          {mensagem("passageiros")}
        </div>

        <div className="field field--full">
          <fieldset className="fieldset">
            <legend className="fieldset__legend">Estilo da viagem</legend>
            <div className="chip-row">
              {ESTILOS_VIAGEM.map(({ valor, rotulo }) => (
                <button
                  key={valor}
                  type="button"
                  className="chip"
                  aria-pressed={estado.estilo_viagem === valor}
                  onClick={() => trocarCampo("estilo_viagem", valor)}
                  disabled={desabilitado}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="field field--full">
          <fieldset className="fieldset">
            <legend className="fieldset__legend">Preferência de rota</legend>
            <div className="segmented">
              <button
                type="button"
                className="segmented__option"
                aria-pressed={estado.preferencia_rota === "rapida"}
                onClick={() => trocarCampo("preferencia_rota", "rapida")}
                disabled={desabilitado}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-raio" />
                </svg>
                Mais rápida
              </button>
              <button
                type="button"
                className="segmented__option"
                aria-pressed={estado.preferencia_rota === "economica"}
                onClick={() => trocarCampo("preferencia_rota", "economica")}
                disabled={desabilitado}
              >
                <svg className="icon" aria-hidden="true">
                  <use href="/icons.svg#ic-moeda" />
                </svg>
                Mais econômica
              </button>
            </div>
          </fieldset>
        </div>
      </div>

      <div className="acoes" style={{ marginTop: "var(--space-5)" }}>
        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={carregando || desabilitado}
        >
          {carregando ? (
            <>
              <span className="btn__spinner" aria-hidden="true" />
              Gerando roteiro...
            </>
          ) : (
            <>
              <svg className="icon" aria-hidden="true">
                <use href="/icons.svg#ic-raio" />
              </svg>
              Gerar roteiro
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default RoteiroForm;
