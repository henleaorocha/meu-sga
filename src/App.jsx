import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Square, 
  Plus, 
  ChevronLeft, 
  Menu, 
  Maximize2, 
  List, 
  HelpCircle,
  Bluetooth,
  ClipboardCheck,
  ChevronRight,
  ChevronDown,
  Loader2,
  Code,
  X
} from 'lucide-react';

export default function App() {
  // --- Estados da Interface ---
  const [view, setView] = useState('calibration');
  const [isModalOpen, setIsModalOpen] = useState(false); // Estado para controlar o modal do payload
  
  // --- Estados da Tabela ---
  const [columns, setColumns] = useState(['VM1', 'VM2', 'VM3']);
  const [rows, setRows] = useState([
    { id: 1, vr: '60', vms: { VM1: '', VM2: '', VM3: '' } },
    { id: 2, vr: '120', vms: { VM1: '', VM2: '', VM3: '' } },
    { id: 3, vr: '300', vms: { VM1: '', VM2: '', VM3: '' } },
  ]);

  // --- Estados do Gravador de Áudio e IA ---
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualJson, setManualJson] = useState('{\n  "leituras": [\n    {\n      "id_linha": 1,\n      "vr": 60,\n      "valores_medidos": {\n        "vm1": 60.5,\n        "vm2": 62,\n        "vm3": 63\n      }\n    }\n  ]\n}'); // Estado para o input manual
  
  // --- Novos Estados: Modo Regex ---
  const [inputMode, setInputMode] = useState('ai'); // 'ai' ou 'regex'
  const [activeCell, setActiveCell] = useState({ rIndex: 0, cIndex: 0 });

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  
  // Refs para manter o estado atualizado dentro dos eventos do SpeechRecognition
  const fullTranscriptRef = useRef(''); 
  const isRecordingRef = useRef(false);
  const inputModeRef = useRef('ai');
  const activeCellRef = useRef({ rIndex: 0, cIndex: 0 });
  const columnsRef = useRef(columns);
  const rowsRef = useRef(rows);
  const transcriptRef = useRef(transcript); // Nova referência para a transcrição

  // --- Sincronização de Refs ---
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);
  useEffect(() => { columnsRef.current = columns; }, [columns]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]); // Mantém a referência atualizada em tempo real

  // Injetar fonte Montserrat
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // --- Lógica da Tabela ---
  const handleAddColumn = () => {
    const newColNum = columns.length + 1;
    const newColName = `VM${newColNum}`;
    setColumns([...columns, newColName]);
    
    setRows(rows.map(row => ({
      ...row,
      vms: { ...row.vms, [newColName]: '' }
    })));
  };

  const handleAddRow = () => {
    const newId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    const newVms = columns.reduce((acc, col) => ({ ...acc, [col]: '' }), {});
    setRows([...rows, { id: newId, vr: '', vms: newVms }]);
  };

  const handleVrChange = (id, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, vr: value } : row));
  };

  const handleVmChange = (id, colName, value) => {
    setRows(rows.map(row => row.id === id ? {
      ...row,
      vms: { ...row.vms, [colName]: value }
    } : row));
  };

  // --- Lógica de Áudio e Reconhecimento de Voz ---
  useEffect(() => {
    // Configurar SpeechRecognition se disponível (Chrome/Edge)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-PT';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let newFinalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptSegment = event.results[i][0].transcript;
          // Se a API identificar que o pedaço de frase está finalizado, guardamos no final
          if (event.results[i].isFinal) {
            newFinalTranscript += transcriptSegment + ' ';
            
            // --- NOVA LÓGICA MODO REGEX (SEQUENCIAL) ---
            if (inputModeRef.current === 'regex') {
              const matches = transcriptSegment.match(/\d+([.,]\d{1,2})?/g);
              if (matches) {
                const updates = [];
                let currentRIdx = activeCellRef.current.rIndex;
                let currentCIdx = activeCellRef.current.cIndex;

                matches.forEach(match => {
                  if (currentRIdx < rowsRef.current.length) {
                    updates.push({
                      rIndex: currentRIdx,
                      cIndex: currentCIdx,
                      value: match.replace(',', '.')
                    });

                    // Avançar célula
                    currentCIdx++;
                    if (currentCIdx >= columnsRef.current.length) {
                      currentCIdx = 0;
                      currentRIdx++;
                    }
                  }
                });

                // Atualizar refs e estados visuais
                activeCellRef.current = { rIndex: currentRIdx, cIndex: currentCIdx };
                setActiveCell({ rIndex: currentRIdx, cIndex: currentCIdx });

                // Aplicar as atualizações na tabela num único ciclo (batching)
                if (updates.length > 0) {
                  setRows(prevRows => {
                    let newRows = [...prevRows];
                    updates.forEach(update => {
                      const colName = columnsRef.current[update.cIndex];
                      newRows[update.rIndex] = {
                        ...newRows[update.rIndex],
                        vms: { 
                          ...newRows[update.rIndex].vms, 
                          [colName]: update.value 
                        }
                      };
                    });
                    return newRows;
                  });
                }
              }
            }
            // --- FIM LÓGICA MODO REGEX ---

          } else {
            // Senão, é um pedaço provisório em tempo real
            interimTranscript += transcriptSegment;
          }
        }

        // Acumular as partes finais no histórico consolidado
        if (newFinalTranscript) {
          fullTranscriptRef.current += newFinalTranscript;
        }

        // A transcrição visível será o histórico completo + o provisório atual
        setTranscript(fullTranscriptRef.current + interimTranscript);
      };

      recognition.onerror = (event) => {
        console.error('Erro no reconhecimento de voz:', event.error);
      };

      recognition.onend = () => {
        // Se a gravação parou por timeout de silêncio (mas o utilizador não clicou em parar)
        // Reiniciamos o reconhecimento automaticamente
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.error('Falha ao reiniciar reconhecimento de voz:', e);
          }
        }
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const startRecording = async () => {
    try {
      // Limpar estados anteriores
      setTranscript('');
      fullTranscriptRef.current = '';
      isRecordingRef.current = true;
      setIsRecording(true);

      // 1. Iniciar a API de Reconhecimento de Voz primeiro (Prioridade para a transcrição)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error('Erro ao iniciar reconhecimento:', e);
        }
      } else {
        setTranscript('A gravar... (Reconhecimento de voz não suportado neste navegador)');
      }

      // 2. Verificação de Dispositivo Móvel para prevenir bloqueio de microfone
      // O Android bloqueia o acesso simultâneo ao microfone pelo MediaRecorder e pelo SpeechRecognition.
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (!isMobile) {
        // No Desktop, podemos fazer os dois ao mesmo tempo
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = handleStopRecordingComplete;
        mediaRecorder.start();
      }
    } catch (error) {
      isRecordingRef.current = false;
      setIsRecording(false);
      console.error('Erro ao aceder ao microfone:', error);
      alert('Não foi possível aceder ao microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false; // Indica ao onend para não reiniciar
    setIsRecording(false);
    
    // Parar o reconhecimento de voz
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Parar o MediaRecorder se existir (Desktop)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Parar as tracks para liberar o microfone do sistema
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    } else {
      // Em Mobile (onde o MediaRecorder não foi iniciado para evitar conflitos),
      // forçamos a chamada da conclusão manualmente
      handleStopRecordingComplete();
    }
  };

  // --- Função Auxiliar: Gerar Payload ---
  const generatePayload = () => {
    return {
      quantidade_linhas: rowsRef.current.length,
      lista_referencias: rowsRef.current.map(r => Number(r.vr) || 0),
      quantidade_colunas_vm: columnsRef.current.length,
      nomes_colunas: columnsRef.current.map(c => c.toLowerCase()),
      texto_transcrito: transcriptRef.current // Usa sempre a transcrição mais recente
    };
  };

  // --- Lógica da IA (Integração com API Real) ---
  const handleStopRecordingComplete = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    console.log('Áudio guardado como Blob (apenas Desktop):', audioBlob);
    
    // Preparar Payload usando a função auxiliar
    const payload = generatePayload();
    console.log('Payload gerado pronto para a API:', payload);

    // Chamar a API apenas se o modo selecionado for "ai" e houver texto transcrito
    if (inputModeRef.current === 'ai' && payload.texto_transcrito.trim() !== '') {
      setIsProcessing(true);
      try {
        const response = await fetch('https://integra.arkmeds.com/webhook/c4a548f2-0797-4454-9365-e943468d6c04', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic d2ViaG9va191c2VyOjkxZGMxMTY2Njk='
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Erro na API: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Resposta recebida do Webhook:', data);

        if (data && data.leituras) {
          applyMockData(data); // A função aproveita a mesma estrutura para distribuir os dados
        } else {
          console.warn('A resposta da API não contém a propriedade "leituras":', data);
        }

      } catch (error) {
        console.error('Erro ao chamar a API da IA:', error);
        alert('Houve uma falha ao comunicar com a Inteligência Artificial. Verifique a consola para mais detalhes.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const applyMockData = (data) => {
    const currentRows = rowsRef.current;
    const currentCols = columnsRef.current;

    // Fundir os dados recebidos com as linhas atuais baseando-se no VR ou ID
    const updatedRows = currentRows.map((row, index) => {
      // Tentar encontrar correspondência pelo VR, senão pelo índice/id
      const leitura = data.leituras.find(l => String(l.vr) === String(row.vr)) || data.leituras[index];
      
      if (leitura) {
        const newVms = { ...row.vms };
        // Mapear os valores medidos da resposta (vm1, vm2...) para as colunas atuais (VM1, VM2...)
        Object.keys(leitura.valores_medidos).forEach(key => {
          const upperKey = key.toUpperCase();
          if (currentCols.includes(upperKey)) {
            newVms[upperKey] = leitura.valores_medidos[key];
          }
        });
        
        return {
          ...row,
          vr: leitura.vr.toString(),
          vms: newVms
        };
      }
      return row;
    });

    setRows(updatedRows);
  };

  // --- Renderização Principal ---
  if (view !== 'calibration') {
    return <div className="p-8 text-center text-[#244C5A]">Visualização não implementada.</div>;
  }

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif" }} className="min-h-screen bg-slate-50 text-[#244C5A] pb-24">
      
      {/* Barra de Navegação Superior */}
      <header className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <button className="text-[#0097A9] p-2 hover:bg-slate-100 rounded-full transition-colors">
          <Menu size={24} strokeWidth={2.5} />
        </button>
        <span className="text-lg font-medium text-[#244C5A]">Mark II</span>
        <button className="text-[#0097A9] p-2 hover:bg-slate-100 rounded-full transition-colors">
          <Maximize2 size={20} strokeWidth={2.5} />
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Título da Página */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="text-[#244C5A] hover:bg-slate-200 p-1 rounded-lg transition-colors">
              <ChevronLeft size={28} strokeWidth={2.5} />
            </button>
            <h1 className="text-2xl font-semibold text-[#244C5A]">Tabelas de calibração</h1>
          </div>
          <button className="text-slate-400 hover:text-[#0097A9] transition-colors">
            <HelpCircle size={24} />
          </button>
        </div>

        {/* Etiquetas / Filtros */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
          <List size={24} className="text-slate-400 shrink-0" />
          <div className="flex items-center gap-2 bg-[#0097A9] text-white px-4 py-2 rounded-xl shrink-0 cursor-pointer shadow-md">
            <span className="text-sm font-medium">Frequência do ...</span>
            <ChevronDown size={16} />
          </div>
          <div className="flex items-center gap-2 bg-slate-400 text-white px-4 py-2 rounded-xl shrink-0 cursor-pointer opacity-80">
            <span className="text-sm font-medium">Frequência da ...</span>
          </div>
        </div>

        {/* --- SECÇÃO: TABELA DE CALIBRAÇÃO --- */}
        <section className="bg-white rounded-[24px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          
          <div className="flex justify-end mb-4">
            <button 
              onClick={handleAddColumn}
              className="flex items-center gap-2 text-slate-400 hover:text-[#0097A9] transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              Adicionar coluna
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-[#788b9c] text-white text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 text-center border-b border-r border-slate-300 w-12 bg-[#6b7d8c]">#</th>
                  <th className="px-4 py-3 text-center border-b border-r border-slate-300 w-24 bg-[#6b7d8c]">VR</th>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 text-center border-b border-slate-300 bg-slate-100 text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className="bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2 text-center border-r border-slate-200 bg-[#788b9c] text-white/90 font-medium">
                      {rowIndex + 1}
                    </td>
                    <td className="p-0 border-r border-slate-200">
                      <input
                        type="number"
                        value={row.vr}
                        onChange={(e) => handleVrChange(row.id, e.target.value)}
                        className="w-full h-full min-h-[48px] text-center text-[#0097A9] font-semibold text-base outline-none bg-transparent focus:bg-slate-100 transition-colors"
                        placeholder="-"
                      />
                    </td>
                    {columns.map((col, cIndex) => (
                      <td key={`${row.id}-${col}`} className="p-0 border-r border-slate-100 last:border-r-0 relative">
                        <input
                          type="number"
                          value={row.vms[col]}
                          onChange={(e) => handleVmChange(row.id, col, e.target.value)}
                          onFocus={() => {
                            if (inputMode === 'regex') {
                              setActiveCell({ rIndex: rowIndex, cIndex: cIndex });
                              activeCellRef.current = { rIndex: rowIndex, cIndex: cIndex };
                            }
                          }}
                          className={`w-full h-full min-h-[48px] text-center text-slate-700 font-medium text-base outline-none transition-colors ${
                            inputMode === 'regex' && activeCell.rIndex === rowIndex && activeCell.cIndex === cIndex
                              ? 'bg-yellow-50 ring-2 ring-inset ring-[#FFC72C] z-10 relative' 
                              : 'bg-transparent focus:bg-slate-100'
                          }`}
                          placeholder="-"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <button 
              onClick={handleAddRow}
              className="flex items-center gap-2 text-slate-400 hover:text-[#0097A9] transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              Adicionar linha
            </button>
          </div>
        </section>

        {/* --- SECÇÃO: CAPTURA DE ÁUDIO IA --- */}
        <section className="bg-white rounded-[24px] p-6 shadow-xl border border-slate-100 relative overflow-hidden">
          {/* Decoração de fundo com gradiente subtil */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FFC72C] to-[#0097A9]"></div>
          
          {/* Selector de Modos */}
          <div className="flex justify-center mb-6 mt-2">
            <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1 shadow-inner">
              <button
                onClick={() => setInputMode('ai')}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  inputMode === 'ai' 
                    ? 'bg-white text-[#0097A9] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Modo IA (Texto Livre)
              </button>
              <button
                onClick={() => setInputMode('regex')}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  inputMode === 'regex' 
                    ? 'bg-white text-[#FFC72C] shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Sequencial (Regex)
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <h3 className="text-lg font-semibold text-[#244C5A]">
              {inputMode === 'ai' ? 'Preenchimento por Voz (IA)' : 'Preenchimento Sequencial (Regex)'}
            </h3>
            <p className="text-sm text-slate-500 text-center max-w-sm">
              {inputMode === 'ai' 
                ? 'Dite os valores de forma natural e a nossa Inteligência Artificial preencherá a tabela automaticamente.'
                : 'Dite apenas os números. O sistema preencherá a tabela avançando célula a célula automaticamente.'}
            </p>

            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`
                relative group flex items-center justify-center gap-3 px-8 py-4 rounded-full font-bold text-white transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-lg
                ${isProcessing ? 'bg-slate-400 cursor-not-allowed' : 
                  isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-[#FFC72C] hover:bg-[#e5b327] text-[#244C5A]'}
              `}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin" size={24} />
                  A processar IA...
                </>
              ) : isRecording ? (
                <>
                  <Square size={24} fill="currentColor" />
                  Parar Gravação
                </>
              ) : (
                <>
                  <Mic size={24} />
                  Gravar Comando
                </>
              )}
            </button>

            {/* Área de Transcrição e Botão Payload */}
            <div className="w-full mt-4 bg-slate-50 rounded-2xl p-4 min-h-[80px] border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Transcrição em Tempo Real
                </span>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#0097A9] bg-[#e6f4f5] px-3 py-1.5 rounded-lg hover:bg-[#d0ebed] transition-colors"
                >
                  <Code size={14} />
                  Ver Payload
                </button>
              </div>
              <p className={`text-sm ${transcript ? 'text-[#244C5A]' : 'text-slate-400 italic'}`}>
                {transcript || (isRecording ? 'A ouvir...' : 'O texto ditado aparecerá aqui.')}
              </p>
            </div>
          </div>
        </section>

        {/* --- NOVA SECÇÃO: TESTE MANUAL DE JSON --- */}
        <section className="bg-white rounded-[24px] p-6 shadow-xl border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#244C5A]"></div>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-[#e2e8f0] p-2 rounded-xl text-[#244C5A]">
              <Code size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#244C5A]">Validador de JSON (Modo Teste)</h3>
              <p className="text-xs text-slate-500">
                Cole o output em JSON do seu conversor para testar se a tabela é preenchida corretamente.
              </p>
            </div>
          </div>
          
          <div className="bg-[#1e293b] rounded-2xl p-4 shadow-inner mb-4 focus-within:ring-2 focus-within:ring-[#0097A9] transition-all">
            <textarea
              value={manualJson}
              onChange={(e) => setManualJson(e.target.value)}
              className="w-full h-48 bg-transparent text-[#38bdf8] font-mono text-sm outline-none resize-y"
              spellCheck="false"
              placeholder='Cole aqui o seu JSON...'
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => {
                try {
                  const parsed = JSON.parse(manualJson);
                  if (!parsed.leituras) {
                    alert("Atenção: O JSON deve conter a propriedade raiz 'leituras'.");
                    return;
                  }
                  applyMockData(parsed);
                } catch (error) {
                  alert(`Erro ao analisar JSON: ${error.message}\nVerifique a sintaxe.`);
                }
              }}
              className="bg-[#244C5A] hover:bg-[#1a3843] text-white px-6 py-3 rounded-2xl font-semibold transition-colors shadow-md flex items-center gap-2"
            >
              <ClipboardCheck size={20} />
              Preencher Tabela
            </button>
          </div>
        </section>

      </main>

      {/* --- MODAL DO PAYLOAD --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#244C5A]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#244C5A] flex items-center gap-2">
                <Code className="text-[#0097A9]" size={28} />
                Payload da API
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <p className="text-sm text-slate-500 mb-4">
              Este é o objeto JSON exato que será enviado para o backend quando a gravação for finalizada.
            </p>

            <div className="bg-[#1e293b] rounded-2xl p-6 overflow-auto max-h-[50vh] shadow-inner">
              <pre className="text-sm text-[#38bdf8] font-mono whitespace-pre-wrap">
                {JSON.stringify(generatePayload(), null, 2)}
              </pre>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="bg-[#0097A9] hover:bg-[#007a88] text-white px-8 py-3 rounded-2xl font-semibold transition-colors shadow-md hover:shadow-lg"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}