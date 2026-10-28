LEO PLAYER MUSIC — PWA separado

Arquivos:
- index.html: estrutura da interface.
- style.css: estilos e responsividade.
- app.js: lógica do player, biblioteca local, favoritos, equalizador visual e instalação PWA.
- manifest.webmanifest: metadados para instalação.
- service-worker.js: cache básico dos arquivos da aplicação.
- icons/: ícones SVG do app.

Como usar no PWA Builder:
1. Publique esta pasta em um endereço HTTPS (por exemplo, GitHub Pages).
2. Abra o URL público no PWA Builder.
3. Informe o endereço do manifest.webmanifest se solicitado.
4. Confira os relatórios e gere o pacote para a plataforma desejada.

Importante:
- PWA precisa ser servido por HTTPS ou localhost; abrir index.html diretamente não ativa instalação/service worker.
- O cache offline cobre os arquivos locais do app, mas bibliotecas CDN e o YouTube precisam de internet.
- A importação de pastas depende do suporte do navegador; em alguns celulares é necessário selecionar arquivos manualmente.
- A conversão/extração de MP3 de links do YouTube não estava implementada no código original (era apenas uma animação simulada). O app agora informa essa limitação em vez de mostrar um falso sucesso.
- O equalizador tem controles e presets visuais; processamento de áudio real ainda não estava implementado no código original.
- Teste importação, reprodução e instalação no navegador/dispositivo final antes de distribuir.
