const { exec } = require("child_process");
const path = require("path");

const ytDlp = path.resolve("yt-dlp.exe");
const ffmpegPath = path.resolve("ffmpeg.exe");

function baixarMp3Simples(url) {
    if (!url) return console.log("❌ URL inválida.");

    const comando = `"${ytDlp}" -x --audio-format mp3 --audio-quality 0 --ffmpeg-location "${ffmpegPath}" -o "downloads/%(title)s.%(ext)s" "${url}"`;

    exec(comando, (erro, stdout, stderr) => {
        if (erro) {
            console.error(`❌ Erro ao baixar MP3:\n${stderr}`);
            return;
        }
        console.log(`✅ MP3 baixado com sucesso!`);
    });
}

// Exemplo de uso
baixarMp3Simples("https://youtu.be/JwWicqONOvM?si=yEpfHYq6CQesP8Mm");
