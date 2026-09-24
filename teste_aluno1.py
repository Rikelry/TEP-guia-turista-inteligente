import httpx
from services import buscar_coordenadas, obter_sigla_uf, verificar_token_google

print("=== Teste 1: obter_sigla_uf ===")
print(obter_sigla_uf("Piauí"))  # deve retornar "PI"
print(obter_sigla_uf("São Paulo"))  # deve retornar "SP"

print("\n=== Teste 2: buscar_coordenadas ===")
with httpx.Client() as client:
    lat, lon, uf = buscar_coordenadas(client, "Teresina", "PI")
    print(f"Teresina -> lat={lat}, lon={lon}, uf={uf}")

    lat, lon, uf = buscar_coordenadas(client, "Brasília", "DF")
    print(f"Brasília -> lat={lat}, lon={lon}, uf={uf}")

print("\n=== Teste 3: cidade com UF divergente (Teste 5 do roteiro) ===")
with httpx.Client() as client:
    lat, lon, uf = buscar_coordenadas(client, "Teresina", "RJ")
    print(f"Teresina (informado RJ) -> lat={lat}, lon={lon}, uf_corrigida={uf}")