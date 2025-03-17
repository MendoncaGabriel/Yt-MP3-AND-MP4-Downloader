const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const ytDlp = path.resolve("yt-dlp.exe"); // Caminho correto para o yt-dlp.exe
const ffmpegPath = require("ffmpeg-static");

// Função para limpar o nome do arquivo
function limparNomeArquivo(nome) {
    return nome.replace(/[^a-zA-Z0-9-_.\s]/g, ''); // Remove caracteres especiais
}

// Função para baixar o MP3 de um vídeo
async function baixarEMp3(url, tentativa = 1) {
    if (!url) {
        console.log("❌ URL inválida.");
        return false;
    }

    const pastaDownloads = path.resolve("downloads")
    if (!fs.existsSync(pastaDownloads)) {
        fs.mkdirSync(pastaDownloads);
    }

    console.log(`🎵 Baixando música...`);

    // Obter o título do vídeo usando yt-dlp
    const obterTituloComando = `"${ytDlp}" -e "${url}"`;

    let titulo;
    try {
        titulo = await new Promise((resolve, reject) => {
            exec(obterTituloComando, (erro, stdout, stderr) => {
                if (erro) {
                    console.error(`❌ Erro ao obter título do vídeo: ${url}\n${stderr}`);
                    reject(stderr);
                    return;
                }
                resolve(stdout.trim());
            });
        });
    } catch (erro) {
        console.log("❌ Não foi possível obter o título do vídeo.");
        return false;
    }

    if (!titulo) {
        console.log("❌ Não foi possível obter o título do vídeo.");
        return false;
    }

    const tituloLimpo = limparNomeArquivo(titulo);
    const nomeArquivo = `${tituloLimpo}.mp3`;

    const comando = `"${ytDlp}" -x --audio-format mp3 --audio-quality 128K --ffmpeg-location "${ffmpegPath}" -o "${pastaDownloads}/${nomeArquivo}" "${url}"`;

    try {
        await new Promise((resolve, reject) => {
            const processo = exec(comando);

            processo.stdout.on("data", (data) => {
                const dados = data.toString();
                if (dados.includes("ETA") || dados.includes("downloading")) {
                    console.log(dados);
                }
            });

            processo.stderr.on("data", (data) => {
                console.error(`❌ Erro ao baixar o vídeo\n${data.toString()}`);
                reject(data.toString());
            });

            processo.on("close", (code) => {
                if (code === 0) {
                    console.log(`✅ Música concluída e salva como: ${nomeArquivo}`);
                    resolve(true);
                } else {
                    console.log(`❌ Falha ao baixar a música`);
                    reject();
                }
            });
        });
        return true;
    } catch (erro) {
        if (tentativa < 3) {
            console.log(`⚠️ Tentativa ${tentativa} falhou. Tentando novamente...`);
            return baixarEMp3(url, tentativa + 1);
        }
        return false;
    }
}

// Função para ler os links do arquivo lista.txt e baixar em sequência
async function baixarMusicasEmSequencia() {
    const caminhoLista = path.resolve("lista.txt");

    if (!fs.existsSync(caminhoLista)) {
        console.log("❌ O arquivo lista.txt não foi encontrado.");
        return;
    }

    const conteudo = fs.readFileSync(caminhoLista, "utf-8");
    const urls = conteudo.split("\n").map((url) => url.trim()).filter(Boolean);

    if (urls.length === 0) {
        console.log("❌ Nenhuma URL encontrada no arquivo lista.txt.");
        return;
    }

    console.log(`🎵 Total de ${urls.length} músicas para baixar...`);

    const urlsVisitadas = new Set();
    const urlsComErro = [];
    const urlsDuplicadas = [];
    const urlsProcessadas = [];

    // Baixar músicas em paralelo (máximo de 3 downloads simultâneos)
    const promises = [];

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        // Verificar se a URL já foi visitada
        if (urlsVisitadas.has(url)) {
            urlsDuplicadas.push(url);
            continue;
        }

        urlsVisitadas.add(url);

        const promise = baixarEMp3(url).then((resultado) => {
            if (resultado) {
                urlsProcessadas.push(url);
            } else {
                urlsComErro.push(url);
            }
        }).catch(() => {
            urlsComErro.push(url);
        });

        promises.push(promise);

        // Limitar o número de downloads simultâneos (máximo de 3 por vez)
        if (promises.length >= 3 || i === urls.length - 1) {
            await Promise.all(promises);
            promises.length = 0; // Resetar a lista de promessas para a próxima rodada
        }
    }

    // Tentar baixar novamente as URLs que falharam
    for (const url of urlsComErro) {
        await baixarEMp3(url);
    }

    // Gerar log final
    console.log(`\n🔹 Total de músicas baixadas com sucesso: ${urlsProcessadas.length}`);
    console.log(`🔸 URLs com falha no download:`);
    console.log(urlsComErro.length ? urlsComErro.join("\n") : "Nenhuma falha.");

    console.log(`\n🔸 URLs duplicadas:`);
    console.log(urlsDuplicadas.length ? urlsDuplicadas.join("\n") : "Nenhuma duplicada.");

    console.log(`\n✅ Todos os downloads foram concluídos!`);
}

// Chamar a função para baixar as músicas
baixarMusicasEmSequencia();
