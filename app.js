        // --- INDEXEDDB STORAGE FOR LOCAL TRACKS ---
        const DB_NAME = 'LeoPlayerLocalDB';
        const DB_VERSION = 1;
        let db = null;

        function initDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (e) => {
                    const database = e.target.result;
                    if (!database.objectStoreNames.contains('tracks')) {
                        database.createObjectStore('tracks', { keyPath: 'id' });
                    }
                };
                request.onsuccess = (e) => {
                    db = e.target.result;
                    resolve(db);
                };
                request.onerror = (e) => reject(e);
            });
        }

        async function saveTrackToDB(track) {
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('tracks', 'readwrite');
                const store = tx.objectStore('tracks');
                store.put(track);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        }

        async function getAllTracksFromDB() {
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('tracks', 'readonly');
                const store = tx.objectStore('tracks');
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => reject(e);
            });
        }

        async function clearTracksFromDB() {
            if (!db) await initDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('tracks', 'readwrite');
                const store = tx.objectStore('tracks');
                store.clear();
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        }

        // --- APP STATE ---
        let localTracks = [];
        let filteredTracks = [];
        let currentTrackIndex = -1;
        let activeSource = 'local'; // 'local' or 'youtube'
        let isPlaying = false;
        let isShuffle = false;
        let isLoop = false;
        let ytPlayer = null;
        let audioContext, audioSource, analyser;

        const localAudio = document.getElementById('local-audio-player');

        // --- TOAST SYSTEM ---
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            let borderColor = 'border-cyber-cyan/50';
            let icon = 'fa-circle-info text-cyber-cyan';
            if (type === 'success') { borderColor = 'border-cyber-neonGreen/50'; icon = 'fa-circle-check text-cyber-neonGreen'; }
            if (type === 'error') { borderColor = 'border-red-500/50'; icon = 'fa-triangle-exclamation text-red-400'; }

            toast.className = `glass-panel px-4 py-3 rounded-2xl shadow-lg border ${borderColor} flex items-center gap-3 pointer-events-auto transform translate-y-5 opacity-0 transition-all duration-300 max-w-sm`;
            toast.innerHTML = `
                <i class="fa-solid ${icon} text-lg"></i>
                <div class="flex-1 text-xs text-gray-200 font-medium">${message}</div>
            `;
            container.appendChild(toast);
            setTimeout(() => toast.classList.remove('translate-y-5', 'opacity-0'), 10);
            setTimeout(() => {
                toast.classList.add('translate-y-5', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }

        // --- TAB NAVIGATION ---
        function switchTab(tabId) {
            const tabs = ['local', 'player', 'downloader', 'library', 'equalizer'];
            tabs.forEach(t => {
                document.getElementById(`tab-${t}`).classList.add('hidden');
                const btn = document.getElementById(`tab-btn-${t}`);
                if (btn) btn.className = "px-4 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 text-gray-400 hover:text-white";
                const mobBtn = document.getElementById(`mob-tab-${t}`);
                if (mobBtn) mobBtn.className = "flex flex-col items-center gap-1 text-gray-400 text-[10px]";
            });

            document.getElementById(`tab-${tabId}`).classList.remove('hidden');
            const activeBtn = document.getElementById(`tab-btn-${tabId}`);
            if (activeBtn) activeBtn.className = "px-4 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 bg-cyber-cyan/20 text-cyber-cyan shadow-sm";
            const activeMob = document.getElementById(`mob-tab-${tabId}`);
            if (activeMob) activeMob.className = "flex flex-col items-center gap-1 text-cyber-cyan text-[10px]";
        }

        // --- FILE & FOLDER PICKERS ---
        function openFolderPicker() {
            document.getElementById('folder-input').click();
        }

        function openFilesPicker() {
            document.getElementById('files-input').click();
        }

        async function handleFileSelection(event) {
            const files = Array.from(event.target.files).filter(file => file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name));
            if (files.length === 0) {
                showToast('Nenhum arquivo de áudio suportado encontrado na pasta.', 'error');
                return;
            }

            showToast(`Processando ${files.length} arquivo(s)... Aguarde`, 'info');

            for (let file of files) {
                const id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                const metadata = await extractMetadata(file);

                const trackObj = {
                    id: id,
                    title: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
                    artist: metadata.artist || "Artista Desconhecido",
                    album: metadata.album || "Álbum Desconhecido",
                    cover: metadata.cover || null,
                    fileBlob: file,
                    fileName: file.name
                };

                localTracks.push(trackObj);
                try {
                    await saveTrackToDB(trackObj);
                } catch(e) { console.error(e); }
            }

            filteredTracks = [...localTracks];
            renderLocalTracks();
            showToast(`${files.length} música(s) importada(s) com sucesso!`, 'success');
        }

        function extractMetadata(file) {
            return new Promise((resolve) => {
                if (window.jsmediatags) {
                    jsmediatags.read(file, {
                        onSuccess: function(tag) {
                            const tags = tag.tags;
                            let coverUrl = null;
                            if (tags.picture) {
                                const { data, format } = tags.picture;
                                let base64String = "";
                                for (let i = 0; i < data.length; i++) {
                                    base64String += String.fromCharCode(data[i]);
                                }
                                coverUrl = `data:${format};base64,${btoa(base64String)}`;
                            }
                            resolve({
                                title: tags.title,
                                artist: tags.artist,
                                album: tags.album,
                                cover: coverUrl
                            });
                        },
                        onError: function() {
                            resolve({});
                        }
                    });
                } else {
                    resolve({});
                }
            });
        }

        function renderLocalTracks() {
            const container = document.getElementById('local-tracks-container');
            const countText = document.getElementById('local-track-count');
            countText.innerText = `${filteredTracks.length} Músicas Carregadas`;

            if (filteredTracks.length === 0) {
                container.innerHTML = `
                    <div id="local-empty-state" class="py-16 text-center space-y-4">
                        <div class="w-20 h-20 mx-auto rounded-3xl bg-cyber-cyan/10 text-cyber-cyan flex items-center justify-center text-3xl shadow-neon-cyan">
                            <i class="fa-solid fa-folder-open"></i>
                        </div>
                        <h3 class="cyber-font text-base font-bold text-gray-200">Nenhuma pasta ou música encontrada</h3>
                        <button onclick="openFolderPicker()" class="px-6 py-3 bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/50 text-xs font-bold rounded-xl shadow-neon-cyan">
                            Escolher Pasta de Músicas
                        </button>
                    </div>`;
                return;
            }

            container.innerHTML = filteredTracks.map((track, idx) => {
                const isCurrent = currentTrackIndex === idx && activeSource === 'local';
                return `
                    <div class="flex items-center justify-between p-3.5 rounded-2xl ${isCurrent ? 'bg-cyber-cyan/15 border-cyber-cyan shadow-neon-cyan' : 'bg-cyber-dark/60 hover:bg-cyber-dark/90 border-cyber-border'} border transition group">
                        <div class="flex items-center gap-3 truncate cursor-pointer flex-1" onclick="playLocalTrack(${idx})">
                            <div class="w-10 h-10 rounded-xl bg-cyber-card border border-cyber-border overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                                ${track.cover ? `<img src="${track.cover}" class="w-full h-full object-cover">` : `<i class="fa-solid fa-music ${isCurrent ? 'text-cyber-cyan' : 'text-gray-400'}"></i>`}
                                ${isCurrent && isPlaying ? '<span class="absolute inset-0 bg-black/40 flex items-center justify-center text-cyber-cyan"><i class="fa-solid fa-waveform animate-pulse"></i></span>' : ''}
                            </div>
                            <div class="truncate">
                                <h4 class="text-xs font-bold ${isCurrent ? 'text-cyber-cyan' : 'text-gray-200'} truncate">${track.title}</h4>
                                <p class="text-[11px] text-gray-400 truncate">${track.artist} • ${track.album}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button onclick="playLocalTrack(${idx})" class="w-8 h-8 rounded-lg bg-cyber-cyan/10 text-cyber-cyan flex items-center justify-center hover:bg-cyber-cyan hover:text-black transition">
                                <i class="fa-solid ${isCurrent && isPlaying ? 'fa-pause' : 'fa-play'} text-xs"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function filterLocalTracks() {
            const query = document.getElementById('local-search-input').value.toLowerCase();
            filteredTracks = localTracks.filter(t => 
                t.title.toLowerCase().includes(query) || 
                t.artist.toLowerCase().includes(query) || 
                t.album.toLowerCase().includes(query)
            );
            renderLocalTracks();
        }

        async function clearLocalLibrary() {
            localTracks = [];
            filteredTracks = [];
            await clearTracksFromDB();
            renderLocalTracks();
            showToast('Biblioteca local limpa com sucesso.', 'info');
        }

        // --- LOCAL AUDIO PLAYER ENGINE ---
        function playLocalTrack(index) {
            if (index < 0 || index >= filteredTracks.length) return;
            currentTrackIndex = index;
            activeSource = 'local';
            const track = filteredTracks[index];

            if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
                ytPlayer.pauseVideo();
            }

            const streamUrl = URL.createObjectURL(track.fileBlob);
            localAudio.src = streamUrl;
            localAudio.play();
            isPlaying = true;

            updateStickyPlayerInfo(track.title, track.artist, track.cover);
            updatePlayPauseState();
            renderLocalTracks();
            setupMediaSession(track);
        }

        function updateStickyPlayerInfo(title, artist, cover) {
            document.getElementById('sticky-track-title').innerText = title;
            document.getElementById('sticky-track-artist').innerText = artist;
            const img = document.getElementById('player-album-art');
            const fallback = document.getElementById('player-album-fallback');

            if (cover) {
                img.src = cover;
                img.classList.remove('hidden');
                fallback.classList.add('hidden');
            } else {
                img.classList.add('hidden');
                fallback.classList.remove('hidden');
            }
        }

        function toggleGlobalPlayPause() {
            if (activeSource === 'local') {
                if (!localAudio.src) return;
                if (localAudio.paused) {
                    localAudio.play();
                    isPlaying = true;
                } else {
                    localAudio.pause();
                    isPlaying = false;
                }
                updatePlayPauseState();
                renderLocalTracks();
            } else if (activeSource === 'youtube' && ytPlayer) {
                const state = ytPlayer.getPlayerState();
                if (state === YT.PlayerState.PLAYING) {
                    ytPlayer.pauseVideo();
                    isPlaying = false;
                } else {
                    ytPlayer.playVideo();
                    isPlaying = true;
                }
                updatePlayPauseState();
            }
        }

        function updatePlayPauseState() {
            const btnIcon = document.getElementById('sticky-play-icon');
            if (isPlaying) {
                btnIcon.className = 'fa-solid fa-pause text-sm';
            } else {
                btnIcon.className = 'fa-solid fa-play ml-0.5 text-sm';
            }
        }

        function playNextTrack() {
            if (activeSource === 'local' && filteredTracks.length > 0) {
                let nextIdx = isShuffle ? Math.floor(Math.random() * filteredTracks.length) : currentTrackIndex + 1;
                if (nextIdx >= filteredTracks.length) nextIdx = 0;
                playLocalTrack(nextIdx);
            }
        }

        function playPrevTrack() {
            if (activeSource === 'local' && filteredTracks.length > 0) {
                let prevIdx = currentTrackIndex - 1;
                if (prevIdx < 0) prevIdx = filteredTracks.length - 1;
                playLocalTrack(prevIdx);
            }
        }

        localAudio.addEventListener('ended', () => {
            if (isLoop) {
                localAudio.play();
            } else {
                playNextTrack();
            }
        });

        localAudio.addEventListener('timeupdate', () => {
            if (!isNaN(localAudio.duration)) {
                const cur = localAudio.currentTime;
                const dur = localAudio.duration;
                document.getElementById('audio-seekbar').value = (cur / dur) * 100;
                document.getElementById('current-time-text').innerText = formatTime(cur);
                document.getElementById('total-time-text').innerText = formatTime(dur);
            }
        });

        function seekAudio(val) {
            if (activeSource === 'local' && localAudio.duration) {
                localAudio.currentTime = (val / 100) * localAudio.duration;
            }
        }

        function changeAudioVolume(val) {
            localAudio.volume = val / 100;
        }

        function toggleShuffle() {
            isShuffle = !isShuffle;
            document.getElementById('btn-shuffle').classList.toggle('text-cyber-cyan', isShuffle);
            showToast(isShuffle ? 'Modo Aleatório Ativado' : 'Modo Sequencial', 'info');
        }

        function toggleLoop() {
            isLoop = !isLoop;
            document.getElementById('btn-sticky-loop').classList.toggle('text-cyber-cyan', isLoop);
            showToast(isLoop ? 'Modo Repetição Ativado' : 'Repetição Desativada', 'info');
        }

        function formatTime(secs) {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }

        // --- MEDIA SESSION API FOR LOCK SCREEN / NOTIFICATIONS ---
        function setupMediaSession(track) {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    artwork: track.cover ? [{ src: track.cover, sizes: '512x512', type: 'image/png' }] : []
                });

                navigator.mediaSession.setActionHandler('play', () => { localAudio.play(); isPlaying = true; updatePlayPauseState(); });
                navigator.mediaSession.setActionHandler('pause', () => { localAudio.pause(); isPlaying = false; updatePlayPauseState(); });
                navigator.mediaSession.setActionHandler('previoustrack', playPrevTrack);
                navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
            }
        }

        // --- MINI VISUALIZER ANIMATION ---
        const miniCanvas = document.getElementById('mini-visualizer');
        const miniCtx = miniCanvas.getContext('2d');

        function animateMiniVisualizer() {
            requestAnimationFrame(animateMiniVisualizer);
            miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);

            const bars = 12;
            const width = miniCanvas.width / bars;

            for (let i = 0; i < bars; i++) {
                const height = isPlaying ? Math.random() * miniCanvas.height * 0.9 + 2 : 3;
                miniCtx.fillStyle = '#00f3ff';
                miniCtx.fillRect(i * width, miniCanvas.height - height, width - 1, height);
            }
        }
        animateMiniVisualizer();

        // --- YOUTUBE PLAYER ---
        function onYouTubeIframeAPIReady() {}

        function loadYouTubeTrack() {
            const input = document.getElementById('youtube-input').value.trim();
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = input.match(regExp);
            const videoId = (match && match[2].length === 11) ? match[2] : input;

            if (!videoId) {
                showToast('Link do YouTube inválido', 'error');
                return;
            }

            activeSource = 'youtube';
            localAudio.pause();

            document.getElementById('player-placeholder').classList.add('hidden');
            if (!ytPlayer) {
                ytPlayer = new YT.Player('youtube-player-container', {
                    height: '100%',
                    width: '100%',
                    videoId: videoId,
                    events: {
                        'onReady': (e) => { e.target.playVideo(); isPlaying = true; updatePlayPauseState(); },
                        'onStateChange': (e) => {
                            if (e.data === YT.PlayerState.PLAYING) { isPlaying = true; updatePlayPauseState(); }
                            else { isPlaying = false; updatePlayPauseState(); }
                        }
                    }
                });
            } else {
                ytPlayer.loadVideoById(videoId);
            }

            updateStickyPlayerInfo(`YouTube Stream [${videoId}]`, 'YouTube Audio Engine', null);
            showToast('Reproduzindo vídeo do YouTube', 'success');
        }

        // --- CONVERSOR MP3 SIMULADO ---
        function startDownloadProcess() {
            const progressBox = document.getElementById('download-progress-box');
            const progressBar = document.getElementById('download-progress-bar');
            const percentText = document.getElementById('download-percent');

            progressBox.classList.remove('hidden');
            let p = 0;
            const int = setInterval(() => {
                p += 10;
                progressBar.style.width = p + '%';
                percentText.innerText = p + '%';
                if (p >= 100) {
                    clearInterval(int);
                    showToast('MP3 convertido com sucesso!', 'success');
                }
            }, 200);
        }

        // --- INITIALIZATION ---
        window.onload = async function() {
            try { await initDB(); } catch (error) { console.error(error); showToast('Armazenamento local indisponível neste navegador.', 'error'); return; }
            const savedTracks = await getAllTracksFromDB();
            if (savedTracks && savedTracks.length > 0) {
                localTracks = savedTracks;
                filteredTracks = [...localTracks];
                renderLocalTracks();
                showToast(`${localTracks.length} música(s) recarregada(s) da biblioteca local.`, 'success');
            }
            renderFavorites();
        };

        function toggleFullscreen() {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else if (document.exitFullscreen) document.exitFullscreen();
        }

// --- FAVORITOS ---
const FAVORITES_KEY = 'leoPlayerFavoritesV1';
function readFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); }
  catch (_) { return []; }
}
function saveFavorites(items) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
}
function toggleFavoriteCurrent() {
  if (activeSource !== 'local' || currentTrackIndex < 0 || !filteredTracks[currentTrackIndex]) {
    showToast('Selecione uma música local para favoritar.', 'info'); return;
  }
  const track = filteredTracks[currentTrackIndex];
  const favorites = readFavorites();
  const index = favorites.findIndex(item => item.id === track.id);
  if (index >= 0) {
    favorites.splice(index, 1);
    showToast('Música removida dos favoritos.', 'info');
  } else {
    favorites.push({id: track.id, title: track.title, artist: track.artist, album: track.album, cover: track.cover || null});
    showToast('Música adicionada aos favoritos.', 'success');
  }
  saveFavorites(favorites);
  renderFavorites();
}
function renderFavorites() {
  const list = document.getElementById('favorites-list');
  if (!list) return;
  const favorites = readFavorites();
  if (!favorites.length) {
    list.innerHTML = '<div class="text-center py-12 text-gray-500 text-xs">Nenhum favorito salvo.</div>';
    return;
  }
  list.innerHTML = favorites.map(track => `
    <div class="flex items-center gap-3 p-3 rounded-xl bg-cyber-dark/60 border border-cyber-border">
      <div class="w-10 h-10 rounded-lg overflow-hidden bg-cyber-card flex items-center justify-center">
        ${track.cover ? `<img src="${track.cover}" class="w-full h-full object-cover" alt="">` : '<i class="fa-solid fa-music text-cyber-pink"></i>'}
      </div>
      <div class="min-w-0 flex-1"><div class="text-xs font-bold truncate">${escapeHTML(track.title)}</div>
      <div class="text-[11px] text-gray-400 truncate">${escapeHTML(track.artist)}</div></div>
      <button class="text-red-400 p-2" aria-label="Remover favorito" onclick="removeFavorite('${String(track.id).replace(/'/g, "\\'")}')"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');
}
function removeFavorite(id) {
  saveFavorites(readFavorites().filter(track => track.id !== id));
  renderFavorites();
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// --- EQUALIZADOR: presets visuais e validação dos controles ---
// O EQ visual não altera o áudio original ainda; para processamento real é necessário Web Audio API.
function applyEQPreset(preset) {
  const presets = {
    flat:   [0,0,0,0,0,0,0,0,0,0],
    bass:   [8,7,5,3,1,0,0,0,0,0],
    cyber:  [6,4,1,-2,2,5,7,5,3,2]
  };
  const values = presets[preset] || presets.flat;
  document.querySelectorAll('.eq-slider').forEach((slider, i) => {
    slider.value = values[i] ?? 0;
    const label = slider.parentElement.querySelector('.eq-val');
    if (label) label.textContent = `${slider.value} dB`;
  });
  showToast(`Preset ${preset} aplicado aos controles. O processamento sonoro real ainda precisa ser conectado.`, 'info');
}
function updateEQBand(slider) {
  const label = slider.parentElement.querySelector('.eq-val');
  if (label) label.textContent = `${slider.value} dB`;
}

// O código original simulava conversão sem gerar arquivo. Não apresenta sucesso falso.
function startDownloadProcess() {
  const url = document.getElementById('download-url-input').value.trim();
  if (!url) {
    showToast('Cole um link primeiro. Para converter áudio, use arquivos próprios ou serviços autorizados.', 'error');
    return;
  }
  showToast('Este app não converte links do YouTube em MP3. Use a aba Músicas Locais para tocar arquivos de áudio que você possui.', 'info');
}

// --- PWA: instalação e service worker ---
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.classList.remove('hidden');
});
document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    showToast('No iPhone/iPad, use Compartilhar > Adicionar à Tela de Início. No computador, procure Instalar no menu do navegador.', 'info');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('pwa-banner')?.classList.add('hidden');
});
document.getElementById('btn-close-banner')?.addEventListener('click', () => {
  document.getElementById('pwa-banner')?.classList.add('hidden');
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('Service Worker:', err)));
}
