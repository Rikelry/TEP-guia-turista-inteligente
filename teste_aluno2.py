import httpx

from planejamento import limpar_formato_texto, obter_guia_destino_com_diagnostico
from services import obter_clima, obter_percurso

print("=== Teste 1: obter_clima (coordenadas válidas - Teresina/PI) ===")
with httpx.Client() as client:
    clima = obter_clima(client, -5.089, -42.801)
    print(f"Teresina -> {clima}")

print("\n=== Teste 2: obter_clima (coordenadas zeradas - fallback) ===")
with httpx.Client() as client:
    clima = obter_clima(client, 0.0, 0.0)
    print(f"Coordenadas zeradas -> {clima}")
    print("Esperado: temperatura/umidade/vento = 'N/D'")

print("\n=== Teste 3: obter_percurso (Teresina/PI -> Brasília/DF) ===")
with httpx.Client() as client:
    percurso = obter_percurso(client, -5.089, -42.801, -15.779, -47.929)
    print(f"Teresina -> Brasília: {percurso}")

print("\n=== Teste 4: obter_percurso sem rota rodoviária (Teste 5 do roteiro - ilha) ===")
with httpx.Client() as client:
    # Recife/PE -> Fernando de Noronha/PE (arquipélago sem rota rodoviária)
    percurso = obter_percurso(client, -8.048, -34.877, -3.855, -32.423)
    print(f"Recife -> Fernando de Noronha: {percurso}")
    print("Esperado: distancia='Sem rota direta', tempo='Considere voos ou barcos'")

print("\n=== Teste 5: limpar_formato_texto (remoção de markdown e saudações) ===")
texto_bruto = (
    "Olá! Claro, aqui está seu guia:\n"
    "🏛️ **PONTOS TURÍSTICOS**\n"
    "📍 *Praça Central*\n"
    "## Dica\n"
    "💡 Aproveite o passeio"
)
texto_limpo = limpar_formato_texto(texto_bruto)
print(f"Texto original:\n{texto_bruto}")
print(f"\nTexto limpo:\n{texto_limpo}")
print("Esperado: sem 'Olá!/Claro/aqui está', sem *, ** ou #")

print("\n=== Teste 6: obter_guia_destino_com_diagnostico (Fallback da IA - Teste 2 do roteiro) ===")
print("Obs.: sem GEMINI_API_KEY válida no ambiente, o fallback deve ser acionado automaticamente.")
texto, diagnostico = obter_guia_destino_com_diagnostico("Teresina")
print(f"Diagnóstico: {diagnostico}")
print(f"Guia gerado:\n{texto}")
