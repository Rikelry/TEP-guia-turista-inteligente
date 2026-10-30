// Rodapé semântico HTML5 com créditos pedagógicos do projeto.

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <p>Guia do Turista Inteligente — projeto acadêmico de Automação Web e Python.</p>
        <ul className="footer__stack" aria-label="Tecnologias utilizadas">
          <li className="footer__tag">React 19</li>
          <li className="footer__tag">Vite</li>
          <li className="footer__tag">FastAPI</li>
          <li className="footer__tag">Leaflet</li>
        </ul>
      </div>
    </footer>
  );
}

export default Footer;
