const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const ytDlp = path.resolve("yt-dlp.exe"); // Caminho do yt-dlp
const ffmpeg = path.resolve("ffmpeg.exe"); // Caminho do ffmpeg
const DOWNLOAD_DIR = path.resolve("downloads");
const LIST_FILE = path.resolve("lista.txt");
const MAX_PARALLEL = 3;
const RESOLUTION_MAX = 1080; // Máxima resolução desejada

// Garante que a pasta de downloads existe
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Remove caracteres especiais dos nomes de arquivos
function limparNomeArquivo(nome) {
    return nome.replace(/[<>:"\/\\|?*]+/g, "").trim();
}

// Lista as resoluções disponíveis e retorna a melhor até 1080p
function obterMelhorFormato(url) {
    return new Promise((resolve) => {
        exec(`${ytDlp} -F "${url}"`, (error, stdout) => {
            if (error) {
                console.error(`❌ Erro ao listar formatos para ${url}`);
                return resolve(null);
            }

            const linhas = stdout.split("\n");
            const formatos = [];

            linhas.forEach((linha) => {
                const match = linha.match(/(\d+)\s+(\w+)\s+(\d+)x(\d+)/);
                if (match) {
                    const formatoId = match[1];
                    const altura = parseInt(match[4], 10);
                    formatos.push({ formatoId, altura });
                }
            });

            if (formatos.length === 0) {
                console.log(`⚠️ Nenhum formato MP4 encontrado para ${url}`);
                return resolve(null);
            }

            // Ordenar do maior para o menor
            formatos.sort((a, b) => b.altura - a.altura);

            // Pega a melhor resolução possível até o limite máximo
            const melhorFormato = formatos.find((f) => f.altura <= RESOLUTION_MAX) || formatos[formatos.length - 1];

            console.log(`🎥 Melhor resolução disponível para ${url}: ${melhorFormato.altura}p`);
            resolve(melhorFormato.formatoId);
        });
    });
}

// Mescla áudio e vídeo com FFmpeg e remove os arquivos separados
function mesclarComFFmpeg(videoFile, audioFile, outputFile) {
    return new Promise((resolve) => {
        const comando = `"${ffmpeg}" -i "${videoFile}" -i "${audioFile}" -c:v copy -c:a aac -strict experimental "${outputFile}" -y`;

        exec(comando, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erro ao mesclar ${videoFile} com ${audioFile}: ${stderr}`);
                return resolve(false);
            }

            console.log(`✅ Mesclagem concluída: ${outputFile}`);

            // Remove arquivos originais após a mesclagem
            fs.unlinkSync(videoFile);
            fs.unlinkSync(audioFile);

            console.log(`🗑️ Arquivos originais removidos: ${videoFile}, ${audioFile}`);
            resolve(true);
        });
    });
}

// Baixa um único vídeo e mescla com áudio
async function baixarVideo(url) {
    const formato = await obterMelhorFormato(url);

    if (!formato) {
        console.error(`❌ Não foi possível determinar a melhor resolução para ${url}`);
        return { url, sucesso: false };
    }

    return new Promise((resolve) => {
        console.log(`🎬 Baixando: ${url} em formato ${formato}`);

        const outputTemplate = path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s");

        const comando = `"${ytDlp}" -f "bv*+ba" --output "${outputTemplate}" "${url}"`;

        exec(comando, async (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Erro ao baixar ${url}: ${stderr}`);
                return resolve({ url, sucesso: false });
            }

            console.log(`✅ Download concluído: ${url}`);

            // Localiza os arquivos baixados
            const arquivos = fs.readdirSync(DOWNLOAD_DIR);
            const baseName = limparNomeArquivo(url.split("=").pop());
            const videoFile = arquivos.find((file) => file.includes(baseName) && file.endsWith(".mp4"));
            const audioFile = arquivos.find((file) => file.includes(baseName) && file.endsWith(".m4a"));

            if (!videoFile || !audioFile) {
                console.error(`❌ Arquivos de vídeo/áudio não encontrados para ${url}`);
                return resolve({ url, sucesso: false });
            }

            const videoPath = path.join(DOWNLOAD_DIR, videoFile);
            const audioPath = path.join(DOWNLOAD_DIR, audioFile);
            const outputPath = path.join(DOWNLOAD_DIR, `${baseName}-gv.mp4`);

            const sucesso = await mesclarComFFmpeg(videoPath, audioPath, outputPath);
            resolve({ url, sucesso });
        });
    });
}

// Lê e filtra a lista de URLs
async function lerLista() {
    try {
        const data = fs.readFileSync(LIST_FILE, "utf8");
        let urls = data.split("\n").map((url) => url.trim()).filter(Boolean);

        // Remove duplicatas
        const urlsUnicas = [...new Set(urls)];

        return { urls: urlsUnicas, duplicadas: urls.length - urlsUnicas.length };
    } catch (err) {
        console.error("Erro ao ler lista:", err);
        return { urls: [], duplicadas: 0 };
    }
}

// Controla downloads em paralelo
async function baixarVideosEmLote(urls) {
    let index = 0;
    let urlsComErro = [];

    async function baixarProximo() {
        if (index >= urls.length) return;

        const url = urls[index++];
        const resultado = await baixarVideo(url);

        if (!resultado.sucesso) urlsComErro.push(resultado.url);
        await baixarProximo();
    }

    const tarefas = [];
    for (let i = 0; i < Math.min(MAX_PARALLEL, urls.length); i++) {
        tarefas.push(baixarProximo());
    }

    await Promise.all(tarefas);
    return urlsComErro;
}

// Reexecuta downloads que falharam, um por um
async function rebaixarFalhas(urlsComErro) {
    console.log("\n🔄 Tentando baixar novamente os vídeos que falharam...");
    let urlsAindaComErro = [];

    for (const url of urlsComErro) {
        const resultado = await baixarVideo(url);
        if (!resultado.sucesso) urlsAindaComErro.push(url);
    }

    return urlsAindaComErro;
}

// Fluxo principal
async function main() {
    try {
        const { urls, duplicadas } = await lerLista();
        console.log(`🔹 Vídeos únicos encontrados: ${urls.length}`);
        console.log(`🔸 URLs duplicadas removidas: ${duplicadas}`);

        if (urls.length === 0) {
            console.log("❌ Nenhuma URL para baixar.");
            return;
        }

        let urlsComErro = await baixarVideosEmLote(urls);

        if (urlsComErro.length > 0) {
            console.log(`\n⚠️ ${urlsComErro.length} vídeos falharam na primeira tentativa.`);
            urlsComErro = await rebaixarFalhas(urlsComErro);
        }

        console.log(`\n🔹 Total de vídeos baixados com sucesso: ${urls.length - urlsComErro.length}`);
        console.log(`🔸 URLs com falha no download:`);
        console.log(urlsComErro.length ? urlsComErro.join("\n") : "Nenhuma falha.");
        console.log("\n✅ Todos os downloads foram concluídos!");
    } catch (err) {
        console.error("Erro:", err);
    }
}

main();
