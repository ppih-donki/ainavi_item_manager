// scanner_autoadder.js
// iPad/Safari + HIDバーコードスキャナ対応：スキャン完了を自動検知して「追加」を実行
// 既存UIは変えず、設定のセレクタだけ合わせて使います。

(function () {
  "use strict";

  // ====== 設定（ここだけ合わせればOK）======
  // JAN入力テキストボックスのセレクタ
  const INPUT_SELECTOR = '#janInput';         // 例: <input id="janInput">
  // 「追加」ボタンのセレクタ（存在すれば自動クリック。無ければ CustomEvent を飛ばす）
  const ADD_BUTTON_SELECTOR = '#addButton';   // 例: <button id="addButton">追加</button>

  // スキャン検知パラメータ
  const SCAN_IDLE_MS = 120;   // 入力が止まったと見なす静止時間（ms）
  const MAX_SCAN_DURATION_MS = 2000; // 1回のスキャン最大許容時間（長すぎたら手入力扱い）

  // ====== 内部状態 =======
  const inputEl = document.querySelector(INPUT_SELECTOR);
  if (!inputEl) {
    // 何もせず終了（他画面への悪影響なし）
    return;
  }
  const addBtn = document.querySelector(ADD_BUTTON_SELECTOR);

  let buffer = '';
  let timer = null;
  let scanning = false;
  let scanStartAt = 0;

  // 数字以外は除去
  function digitsOnly(s) {
    return (s || '').replace(/\D+/g, '');
  }

  // EAN-13 / EAN-8 チェックデジット検証
  function isValidEAN(code) {
    if (!/^\d+$/.test(code)) return false;
    if (code.length === 13) return verifyEAN13(code);
    if (code.length === 8)  return verifyEAN8(code);
    return false;
  }
  function verifyEAN13(code) {
    // 12桁からチェックデジット算出
    const base = code.slice(0, 12).split('').map(Number);
    const cd = Number(code[12]);
    // 偶数位に3倍（1始まりの位置）
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      const pos = i + 1;
      sum += base[i] * (pos % 2 === 0 ? 3 : 1);
    }
    const calc = (10 - (sum % 10)) % 10;
    return calc === cd;
  }
  function verifyEAN8(code) {
    const base = code.slice(0, 7).split('').map(Number);
    const cd = Number(code[7]);
    // 奇数位×3 + 偶数位×1（1始まり）
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      const pos = i + 1;
      sum += base[i] * (pos % 2 === 1 ? 3 : 1);
    }
    const calc = (10 - (sum % 10)) % 10;
    return calc === cd;
  }

  function resetScan(reason) {
    buffer = '';
    scanning = false;
    scanStartAt = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // 入力欄も消す（無効入力が残らない仕様）
    inputEl.value = '';
  }

  // 追加ボタンがある場合はクリック、無ければイベント通知
  function triggerAdd(jan) {
    if (addBtn) {
      // 入力欄に値を入れてから click（既存の“追加”処理がその値を読む前提）
      inputEl.value = jan;
      // 連打防止のため同期で1回だけ
      addBtn.click();
    } else {
      // 既存コードが拾えるよう CustomEvent を発火
      const ev = new CustomEvent('jan:scanned', { detail: { jan } });
      inputEl.dispatchEvent(ev);
    }
    // クリアして次のスキャンに備える
    inputEl.value = '';
  }

  function commitIfComplete(flushReason) {
    const jan = digitsOnly(buffer);
    if (!jan) {
      resetScan('empty');
      return;
    }
    // 8 or 13 桁で、チェックデジットOKなら追加
    if ((jan.length === 13 || jan.length === 8) && isValidEAN(jan)) {
      triggerAdd(jan);
      resetScan('committed:' + flushReason);
    } else {
      // 失敗時は静かに破棄してクリア（仕様どおり）
      resetScan('invalid:' + flushReason);
    }
  }

  function scheduleIdleCommit() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // 総所要時間が長すぎる場合は「手入力」とみなして自動追加しない
      const now = performance.now();
      if (scanning && (now - scanStartAt) <= MAX_SCAN_DURATION_MS) {
        commitIfComplete('idle');
      } else {
        resetScan('timeout');
      }
    }, SCAN_IDLE_MS);
  }

  // ---- iOSでも確実に発火する input イベントを主軸にする ----
  inputEl.addEventListener('input', (e) => {
    const val = String(inputEl.value || '');
    // スキャナの出力にはCR/LF/Tabが末尾に混ざることがある
    const hasTerminator = /[\r\n\t]$/.test(val);

    // バッファに追記（スキャナは高速なので、ここでまとめて受ける）
    if (!scanning) {
      scanning = true;
      scanStartAt = performance.now();
      buffer = '';
    }
    buffer += val;

    if (hasTerminator) {
      // 末端制御文字を取り除いて確定
      buffer = buffer.replace(/[\r\n\t]+/g, '');
      commitIfComplete('terminator');
    } else {
      // しばらく入力が止まれば確定（Enter無しでも動く）
      scheduleIdleCommit();
    }
  });

  // ---- Enter/Tab を keydown でも補足（HIDによってはこちらが先に来る場合あり）----
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); // フォーム送信やフォーカス移動を抑止
      if (!scanning) {
        scanning = true;
        scanStartAt = performance.now();
      }
      // 直近のinput値をバッファに反映して確定
      buffer += String(inputEl.value || '');
      commitIfComplete('keydown:' + e.key);
    }
  });

  // 念のため change も拾う（PC互換）
  inputEl.addEventListener('change', () => {
    // iPadでは発火しないことが多いが、PCや他端末では保険として
    if (!scanning) {
      scanning = true;
      scanStartAt = performance.now();
    }
    buffer += String(inputEl.value || '');
    commitIfComplete('change');
  });

  // ペーストでの取り込みにも対応（店舗で貼付利用する場合の保険）
  inputEl.addEventListener('paste', (e) => {
    const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
    if (txt) {
      e.preventDefault();
      inputEl.value = txt;
      // input イベントが出ないケースのため直接処理
      scanning = true;
      scanStartAt = performance.now();
      buffer = txt;
      commitIfComplete('paste');
    }
  });

  // 初期化：数字以外の入力を自動で除去していく（手入力でも安全）
  inputEl.setAttribute('inputmode', 'numeric'); // iPadで数字キーボードを出やすくする
  inputEl.addEventListener('beforeinput', (e) => {
    if (e.data && /\D/.test(e.data)) {
      // 数字以外の入力を抑止（スキャナのCR/LFはinput側で吸収済み）
      e.preventDefault();
    }
  });
})();
