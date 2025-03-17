# Music Downloader

Baixe músicas do YouTube em MP3 com `yt-dlp`. As músicas serão salvas na pasta `downloads`.

## Requisitos

- **Node.js v22.14.0**
- **yt-dlp** (arquivo `yt-dlp.exe` no projeto)
- **ffmpeg** (para conversão de áudio)

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/MendoncaGabriel/YtMP3Downloader
   cd seu-diretorio
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

## Como usar

1. Adicione URLs de vídeos do YouTube no arquivo `lista.txt` (uma URL por linha).

2. Execute o script:
   - **Via linha de comando:**
     ```bash
     node index.js
     ```
   - **Via arquivo `start.bat`** (Windows): clique para executar.
