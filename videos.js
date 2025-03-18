const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const ytDlp = path.resolve("yt-dlp.exe"); // Caminho do yt-dlp
const ffmpeg = path.resolve("ffmpeg.exe"); // Caminho do ffmpeg
const DOWNLOAD_DIR = path.resolve("downloads");
const LIST_FILE = path.resolve("lista.txt");
const RESOLUTION_MAX = 1080; // Máxima resolução desejada
const MAX_RETRIES = 3; // Número máximo de tentativas por vídeo

// Garante que a pasta de downloads existe
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Remove caracteres especiais dos nomes de arquivos
function limparNomeArquivo(nome) {
    return nome.replace(/[<>:"/\\|?*]+/g, "").trim();
}

// Obtém a melhor resolução possível até 1080p
function obterMelhorFormato(url) {
    return new Promise((resolve) => {
        exec(`${ytDlp} -F "${url}"`, (error, stdout) => {
            if (error) {
                console.error(`❌ Erro ao listar formatos para ${url}`);
                return resolve(null);
            }

            const formatos = stdout.split("\n")
                .map(linha => linha.match(/(\d+)\s+\w+\s+(\d+)x(\d+)/))
                .filter(match => match)
                .map(match => ({ formatoId: match[1], altura: parseInt(match[3], 10) }))
                .sort((a, b) => b.altura - a.altura);

            const melhorFormato = formatos.find(f => f.altura <= RESOLUTION_MAX) || formatos[0];

            if (!melhorFormato) {
                console.log(`⚠️ Nenhum formato adequado encontrado para ${url}`);
                return resolve(null);
            }

            console.log(`🎥 Melhor resolução para ${url}: ${melhorFormato.altura}p`);
            resolve(melhorFormato.formatoId);
        });
    });
}

// Mescla vídeo e áudio com FFmpeg
function mesclarComFFmpeg(videoFile, audioFile, outputFile) {
    return new Promise((resolve) => {
        const comando = `"${ffmpeg}" -i "${videoFile}" -i "${audioFile}" -c:v copy -c:a aac -strict experimental "${outputFile}" -y`;

        exec(comando, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erro ao mesclar ${videoFile} com ${audioFile}: ${stderr}`);
                return resolve(false);
            }

            console.log(`✅ Mesclagem concluída: ${outputFile}`);
            fs.unlinkSync(videoFile);
            fs.unlinkSync(audioFile);
            resolve(true);
        });
    });
}

// Baixa um único vídeo
async function baixarVideo(url) {
    const formato = await obterMelhorFormato(url);
    if (!formato) return false;

    return new Promise((resolve) => {
        console.log(`🎬 Baixando: ${url} em formato ${formato}`);
        const outputTemplate = path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s");
        const comando = `"${ytDlp}" -f "bv*+ba" --output "${outputTemplate}" "${url}"`;

        exec(comando, async (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erro ao baixar ${url}: ${stderr}`);
                return resolve(false);
            }

            console.log(`✅ Download concluído: ${url}`);

            // Encontra os arquivos baixados
            const arquivos = fs.readdirSync(DOWNLOAD_DIR);
            const baseName = limparNomeArquivo(url.split("=").pop());
            const videoFile = arquivos.find(f => f.includes(baseName) && f.endsWith(".mp4"));
            const audioFile = arquivos.find(f => f.includes(baseName) && f.endsWith(".m4a"));

            if (!videoFile || !audioFile) {
                console.error(`❌ Arquivos de vídeo/áudio não encontrados para ${url}`);
                return resolve(false);
            }

            const sucesso = await mesclarComFFmpeg(
                path.join(DOWNLOAD_DIR, videoFile),
                path.join(DOWNLOAD_DIR, audioFile),
                path.join(DOWNLOAD_DIR, `${baseName}-gv.mp4`)
            );

            resolve(sucesso);
        });
    });
}

// Lê a lista de URLs do arquivo
async function lerLista() {
    try {
        const data = fs.readFileSync(LIST_FILE, "utf8");
        const urls = [...new Set(data.split("\n").map(url => url.trim()).filter(Boolean))];
        return urls;
    } catch (err) {
        console.error("Erro ao ler lista:", err);
        return [];
    }
}

// Controla o fluxo de download e re-tentativas
async function baixarVideos(urls) {
    let urlsComErro = [];

    for (const url of urls) {
        let sucesso = false;
        for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
            console.log(`🔄 Tentativa ${tentativa} de ${MAX_RETRIES} para: ${url}`);
            sucesso = await baixarVideo(url);
            if (sucesso) break;
        }

        if (!sucesso) {
            console.error(`❌ Falha final no download: ${url}`);
            urlsComErro.push(url);
        }
    }

    return urlsComErro;
}

// Fluxo principal
async function main() {
    try {
        const urls = await lerLista();

        if (urls.length === 0) {
            console.log("❌ Nenhuma URL para baixar.");
            return;
        }

        console.log(`🔹 Total de vídeos a baixar: ${urls.length}`);

        const urlsComErro = await baixarVideos(urls);

        console.log(`\n🔹 Total de vídeos baixados com sucesso: ${urls.length - urlsComErro.length}`);
        console.log(`🔸 URLs que falharam:`);

        if (urlsComErro.length) {
            console.log(urlsComErro.join("\n"));
        } else {
            console.log("✅ Nenhuma falha.");
        }

        console.log("\n✅ Todos os downloads foram concluídos!");
    } catch (err) {
        console.error("Erro:", err);
    }
}

main();
