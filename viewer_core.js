// グローバル変数
let allData = [];
let selectedStore = null;
let selectedFloor = null;
let selectedMapType = "map";
let selectedItems = []; // { shelf_id, jan, productName }
let currentDisplayedShelfId = null; // 現在表示中の棚ID
let productAdditionList = []; // 追加予定商品リスト { shelf_id, jan, productName }
let shelfLocationMap = {}; // 棚の位置情報を永続的に保持 { shelf_id: { x, y, store_id, floor, has_product } }
let storesWithFloors = []; // 店舗・フロア情報を保持 { store_id, floors: [] }
let currentFloorImageName = null; // 現在のフロア画像名
let currentShelfData = null; // 現在表示中の棚の商品データ
let markersVisible = true; // 棚番号の表示状態

// ズーム・パン機能
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mapContentElement = null;
let searchHighlightedMarkers = [];
let allMarkers = []; // 全マーカーの参照を保持

// const API_URL = "https://ai-item-location-search-api-1066573637137.us-central1.run.app"
const API_URL = "https://ainavi.ppihgroup.net/staff/api"

document.addEventListener("DOMContentLoaded", async () => {
  // ローディング状態を開始
  showLoading();

  // 既存のイベントリスナー
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("addProductBtn").addEventListener("click", handleAddProductBtnClick);
  document.getElementById("selectAllBtn").addEventListener("click", () => {
    if (currentDisplayedShelfId && currentShelfData) {
      selectAllProducts(currentShelfData, currentDisplayedShelfId);
    }
  });
  document.getElementById("clearAllBtn").addEventListener("click", () => {
    selectedItems = [];
    updateSelectionUI();
    updateCategoryButtonStates();
  });
  document.getElementById("deleteSelectedBtn").addEventListener("click", async () => {
    if (selectedItems.length === 0) {
      alert("削除する商品が選択されていません。");
      return;
    }
    if (!confirm("選択した商品を削除しますか？")) return;

    try {
      const response = await fetch(`${API_URL}/products`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: selectedItems })
      });
      const result = await response.json();
      if (result.status === "ok") {
        alert("削除に成功しました。");
        selectedItems = [];
        updateSelectionUI();
        // 表示の更新
        if (currentDisplayedShelfId) {
          await showShelfProducts(currentDisplayedShelfId);
        }
      } else {
        alert("削除に失敗しました。");
      }
    } catch (e) {
      console.error("削除エラー:", e);
      alert("削除に失敗しました。");
    }
  });

  // 検索機能
  document.getElementById("searchBtn").addEventListener("click", searchShelf);
  document.getElementById("showAllMarkersBtn").addEventListener("click", showAllMarkers);
  document.getElementById("shelfSearchInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchShelf();
  });

  window.addEventListener("resize", () => {
    const img = document.querySelector("#mapContainer img");
    if (img) renderMarkers(img);
  });

  // 初期状態での商品追加ボタン状態更新
  updateAddProductBtnState(false);

  try {
    await loadInitialData();
  } catch (e) {
    console.error("初期データ読み込みエラー:", e);
    alert("データの読み込みに失敗しました。");
  } finally {
    hideLoading();
  }
});

// ローディング表示
function showLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "flex";
}
function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
}

// 初期データ読み込み
async function loadInitialData() {
  // 店舗・フロア一覧
  const stores = await fetch(`${API_URL}/stores`).then(r => r.json());
  storesWithFloors = stores || [];
  populateStoreSelector(storesWithFloors);

  // 画像種別セレクト初期化
  const imageTypeSelect = document.getElementById("imageTypeSelect");
  imageTypeSelect.value = "map";
  imageTypeSelect.onchange = async () => {
    selectedMapType = imageTypeSelect.value;
    if (selectedStore && selectedFloor) {
      await loadFloorImageAndData(selectedStore, selectedFloor, selectedMapType);
    }
  };

  // セレクタ変更
  const storeSel = document.getElementById("storeSelector");
  const floorSel = document.getElementById("floorSelector");

  storeSel.onchange = async () => {
    selectedStore = storeSel.value || null;
    selectedFloor = null;
    populateFloorSelector(selectedStore);
    updateAddProductBtnState(false);
    clearMap();
  };

  floorSel.onchange = async () => {
    selectedFloor = floorSel.value || null;
    updateAddProductBtnState(!!(selectedStore && selectedFloor));
    if (selectedStore && selectedFloor) {
      await loadFloorImageAndData(selectedStore, selectedFloor, selectedMapType);
    } else {
      clearMap();
    }
  };

  // 最新情報取得
  document.getElementById("refreshDataBtn").onclick = async () => {
    if (selectedStore && selectedFloor) {
      await loadFloorImageAndData(selectedStore, selectedFloor, selectedMapType, { force: true });
    }
  };
}

// 店舗セレクタ
function populateStoreSelector(stores) {
  const sel = document.getElementById("storeSelector");
  sel.innerHTML = '<option value="">店舗選択</option>';
  (stores || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.store_id;
    opt.textContent = `${s.store_id}`;
    sel.appendChild(opt);
  });
}

// フロアセレクタ
function populateFloorSelector(store_id) {
  const sel = document.getElementById("floorSelector");
  sel.innerHTML = '<option value="">フロア選択</option>';
  const s = (storesWithFloors || []).find(x => x.store_id === store_id);
  if (!s) return;
  (s.floors || []).forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  });
}

// 画像・棚情報のロード
async function loadFloorImageAndData(store_id, floor, imgType, opts = {}) {
  showLoading();
  try {
    const imgName = `${store_id}_${floor}_${imgType}.jpg`;
    currentFloorImageName = imgName;

    const container = document.getElementById("mapContainer");
    container.innerHTML = "";

    const img = document.createElement("img");
    img.src = `./images/${imgName}`;
    img.alt = imgName;
    img.onload = () => {
      container.appendChild(img);
      renderMarkers(img);
      setupZoomPan(img);
    };
    img.onerror = () => {
      container.textContent = "該当のフロア画像が見つかりません。";
    };

    // 棚位置情報
    const shelves = await fetch(`${API_URL}/shelves?store_id=${store_id}&floor=${encodeURIComponent(floor)}`).then(r => r.json());
    // 商品有無フラグ等を保持
    shelfLocationMap = {};
    (shelves || []).forEach(s => {
      shelfLocationMap[s.shelf_id] = {
        x: s.x,
        y: s.y,
        store_id: s.store_id,
        floor: s.floor,
        has_product: !!s.has_product
      };
    });
  } catch (e) {
    console.error("フロア読み込みエラー:", e);
  } finally {
    hideLoading();
  }
}

// マーカー描画
function renderMarkers(img) {
  // 既存マーカー削除
  const old = document.querySelectorAll(".shelf-marker");
  old.forEach(el => el.remove());
  allMarkers = [];

  const container = document.getElementById("mapContainer");
  const rect = img.getBoundingClientRect();
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;

  Object.entries(shelfLocationMap).forEach(([shelf_id, info]) => {
    const x = info.x;
    const y = info.y;

    const marker = document.createElement("div");
    marker.className = "shelf-marker";
    marker.textContent = String(shelf_id).split("_").slice(2,3)[0] || shelf_id;
    marker.style.position = "absolute";
    marker.style.left = `${(x / 150) * rect.width}px`;
    marker.style.top = `${(y / 212) * rect.height}px`;
    marker.style.transform = "translate(-50%, -50%)";
    marker.dataset.shelfId = shelf_id;

    if (info.has_product) marker.classList.add("has-product");

    marker.addEventListener("click", () => onShelfMarkerClick(shelf_id));
    container.appendChild(marker);
    allMarkers.push(marker);
  });
}

// 棚クリック
async function onShelfMarkerClick(shelf_id) {
  currentDisplayedShelfId = shelf_id;
  await showShelfProducts(shelf_id);
  updateAddProductBtnState(true);
}

// 商品一覧表示
async function showShelfProducts(shelf_id) {
  showLoading();
  try {
    const resp = await fetch(`${API_URL}/products?shelf_id=${encodeURIComponent(shelf_id)}`);
    const items = await resp.json();
    currentShelfData = items || [];

    const cont = document.getElementById("imageContainer");
    cont.innerHTML = "";

    if (currentShelfData.length === 0) {
      cont.textContent = "この棚には商品が登録されていません。";
      return;
    }

    currentShelfData.forEach(item => {
      const card = document.createElement("div");
      card.className = "product-card";

      const img = document.createElement("img");
      img.src = `https://shop-static.donki.com/production/images-voice/public/images/SM_${item.jan}_1.jpg`;
      img.alt = item.jan;
      img.onerror = () => { img.style.display = "none"; };

      const name = document.createElement("div");
      name.className = "product-name";
      name.textContent = item.productName || item.jan;

      const jan = document.createElement("div");
      jan.className = "product-jan";
      jan.textContent = item.jan;

      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.onchange = () => {
        if (chk.checked) {
          selectedItems.push({ shelf_id: item.shelf_id, jan: item.jan, productName: item.productName });
        } else {
          selectedItems = selectedItems.filter(x => !(x.shelf_id === item.shelf_id && x.jan === item.jan));
        }
        updateSelectionUI();
      };

      card.appendChild(img);
      card.appendChild(name);
      card.appendChild(jan);
      card.appendChild(chk);
      cont.appendChild(card);
    });
  } catch (e) {
    console.error("商品一覧表示エラー:", e);
  } finally {
    hideLoading();
  }
}

// ボタン状態
function updateAddProductBtnState(enabled) {
  const btn = document.getElementById("addProductBtn");
  btn.disabled = !enabled;
  document.getElementById("selectAllBtn").disabled = !(currentShelfData && currentShelfData.length > 0);
}

// 検索
function searchShelf() {
  const q = (document.getElementById("shelfSearchInput").value || "").trim();
  if (!q) return;
  const target = Object.keys(shelfLocationMap).find(sid => sid.includes(`_${q}_`));
  if (!target) {
    alert("該当の棚が見つかりません。");
    return;
  }
  highlightMarker(target);
}
function highlightMarker(shelf_id) {
  searchHighlightedMarkers.forEach(m => m.classList.remove("highlight"));
  searchHighlightedMarkers = [];
  const m = allMarkers.find(x => x.dataset.shelfId === shelf_id);
  if (m) {
    m.classList.add("highlight");
    searchHighlightedMarkers.push(m);
  }
}
function showAllMarkers() {
  searchHighlightedMarkers.forEach(m => m.classList.remove("highlight"));
  searchHighlightedMarkers = [];
}

// ズーム・パン（簡易）
function setupZoomPan(img) {
  const container = document.getElementById("mapContainer");
  let scale = 1;
  let dx = 0, dy = 0;
  let dragging = false;
  let sx = 0, sy = 0;

  container.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(3, Math.max(0.5, scale + delta));
    container.style.transform = `scale(${scale}) translate(${dx}px, ${dy}px)`;
  };
  container.onmousedown = (e) => {
    dragging = true;
    sx = e.clientX; sy = e.clientY;
  };
  container.onmousemove = (e) => {
    if (!dragging) return;
    dx += (e.clientX - sx) / scale;
    dy += (e.clientY - sy) / scale;
    sx = e.clientX; sy = e.clientY;
    container.style.transform = `scale(${scale}) translate(${dx}px, ${dy}px)`;
  };
  container.onmouseup = () => dragging = false;
  container.onmouseleave = () => dragging = false;

  // リセットボタン
  document.getElementById("resetZoomBtn").onclick = () => {
    scale = 1; dx = 0; dy = 0;
    container.style.transform = `scale(1) translate(0px, 0px)`;
  };
  // 表示切替
  const toggleBtn = document.getElementById("toggleMarkersBtn");
  toggleBtn.onclick = () => {
    markersVisible = !markersVisible;
    toggleBtn.textContent = markersVisible ? "棚番号を非表示" : "棚番号を表示";
    document.querySelectorAll(".shelf-marker").forEach(el => {
      el.style.display = markersVisible ? "block" : "none";
    });
  };
  // ズームボタン
  document.getElementById("zoomInBtn").onclick = () => {
    scale = Math.min(3, scale + 0.1);
    container.style.transform = `scale(${scale}) translate(${dx}px, ${dy}px)`;
  };
  document.getElementById("zoomOutBtn").onclick = () => {
    scale = Math.max(0.5, scale - 0.1);
    container.style.transform = `scale(${scale}) translate(${dx}px, ${dy}px)`;
  };
}

// 商品追加ボタン
function handleAddProductBtnClick() {
  if (!currentDisplayedShelfId) {
    alert("棚を選択してください。");
    return;
  }
  openProductAdditionModal(currentDisplayedShelfId);
}

// モーダルを開く
function openProductAdditionModal(shelf_id) {
  const modal = document.getElementById("productAdditionModal");
  modal.style.display = "block";

  // モーダル内の棚情報
  const info = document.getElementById("modalShelfInfo");
  info.textContent = `棚ID: ${shelf_id}`;

  // 入力方法の初期状態
  document.getElementById("methodHandy").checked = true;
  toggleInputMethod();

  // リスト初期化
  productAdditionList = [];

  // リスナー設定
  setupModalEventListeners(shelf_id);
}

// モーダルを閉じる
function closeProductAdditionModal() {
  const modal = document.getElementById("productAdditionModal");
  modal.style.display = "none";
  productAdditionList = [];
}

// モーダル内のイベントリスナー設定
function setupModalEventListeners(shelf_id) {
  // 既存のリスナーを削除
  const importBtn = document.getElementById("importCSVBtn");
  const addManualBtn = document.getElementById("addManualJANBtn");
  const registerBtn = document.getElementById("registerProductsBtn");
  const handyRadio = document.getElementById("methodHandy");
  const manualRadio = document.getElementById("methodManual");
  const handyFileInput = document.getElementById("handyCSVFile");

  // 新しいリスナーを設定
  importBtn.onclick = () => {
    // ファイル選択前にvalueをクリアして同じファイルを再選択可能にする
    handyFileInput.value = '';
    handyFileInput.click();
  };
  handyFileInput.onchange = (e) => handleHandyCSVUpload(e, shelf_id);
  addManualBtn.onclick = () => handleManualJANAdd(shelf_id);
  registerBtn.onclick = () => handleProductRegistration(shelf_id);
  handyRadio.onchange = toggleInputMethod;
  manualRadio.onchange = toggleInputMethod;

  // Enterキーでの追加
  document.getElementById("manualJAN").onkeypress = (e) => {
    if (e.key === 'Enter') handleManualJANAdd(shelf_id);
  };

  // ==== iPad/HIDスキャナ自動確定対応（input主軸 + Enter/Tab保険） ====
  (function(){
    const inputEl = document.getElementById("manualJAN");
    const addBtn  = document.getElementById("addManualJANBtn");
    if (!inputEl || !addBtn) return;

    const SCAN_IDLE_MS = 120;
    const MAX_SCAN_DURATION_MS = 2000;

    let buffer = '';
    let timer = null;
    let scanning = false;
    let scanStartAt = 0;

    function digitsOnly(s){ return (s || '').replace(/\D+/g,''); }

    function commit(){
      const jan = digitsOnly(buffer);
      buffer=''; scanning=false; scanStartAt=0;
      if(timer){ clearTimeout(timer); timer=null; }

      if(!jan){ inputEl.value=''; return; }

      const validation = validateJANCode(jan);
      if(!validation.valid){
        inputEl.value=''; // 無効入力は静かに破棄
        return;
      }
      inputEl.value = validation.jan; // 既存の追加フローに合わせる
      addBtn.click();
      inputEl.value = '';
    }

    function schedule(){
      if(timer) clearTimeout(timer);
      timer = setTimeout(()=>{
        const now = performance.now();
        if(scanning && (now - scanStartAt) <= MAX_SCAN_DURATION_MS){
          commit();
        }else{
          buffer=''; scanning=false; scanStartAt=0;
          if(timer){ clearTimeout(timer); timer=null; }
          inputEl.value='';
        }
      }, SCAN_IDLE_MS);
    }

    inputEl.addEventListener('input', ()=>{
      const val = String(inputEl.value || '');
      const hasTerm = /[\r\n\t]$/.test(val);
      if(!scanning){
        scanning = true;
        scanStartAt = performance.now();
        buffer = '';
      }
      buffer += val;
      if(hasTerm){
        buffer = buffer.replace(/[\r\n\t]+/g,'');
        commit();
      }else{
        schedule();
      }
    });

    inputEl.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key==='Tab'){
        e.preventDefault();
        if(!scanning){
          scanning = true;
          scanStartAt = performance.now();
        }
        buffer += String(inputEl.value || '');
        commit();
      }
    });

    inputEl.addEventListener('change', ()=>{
      if(!scanning){
        scanning = true;
        scanStartAt = performance.now();
      }
      buffer += String(inputEl.value || '');
      commit();
    });

    inputEl.addEventListener('paste', (e)=>{
      const txt = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if(txt){
        e.preventDefault();
        inputEl.value = txt;
        scanning = true;
        scanStartAt = performance.now();
        buffer = txt;
        commit();
      }
    });

    inputEl.setAttribute('inputmode','numeric');
    inputEl.addEventListener('beforeinput',(e)=>{
      if(e.data && /\D/.test(e.data)){
        e.preventDefault();
      }
    });
  })();
}

// 入力方法切り替え
function toggleInputMethod() {
  const isHandy = document.getElementById("methodHandy").checked;
  document.getElementById("handyTerminalInput").style.display = isHandy ? "block" : "none";
  document.getElementById("manualInput").style.display = isHandy ? "none" : "block";
}

// ハンディターミナルCSVファイルの処理
function handleHandyCSVUpload(event, shelf_id) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    const lines = text.split(/\r?\n/);
    const invalidJANs = [];
    let addedCount = 0;

    lines.slice(1).forEach((line, index) => { // 1行目はヘッダ前提
      const columns = line.split(',');
      const lineNumber = index + 2; // ヘッダー行を考慮して+2

      // E列（5番目の列、インデックス4）がJANコード
      if (columns.length >= 5) {
        const jan = columns[4].trim();

        // 空文字をスキップ
        if (jan) {
          // JANコードバリデーション
          const validation = validateJANCode(jan);
          if (!validation.valid) {
            // バリデーションエラーをリストに追加
            invalidJANs.push({
              jan: jan,
              lineNumber: lineNumber,
              error: validation.message
            });
            console.warn(`ハンディターミナルCSV内の無効なJANコード「${jan}」をスキップしました: ${validation.message}`);
            return; // このJANコードをスキップして次へ
          }

          const validatedJAN = validation.jan;

          // 既存のJANコードがあっても再度追加（同じCSVファイルの再読み込みを可能にする）
          const existingIndex = productAdditionList.findIndex(item => item.jan === validatedJAN);
          if (existingIndex === -1) {
            productAdditionList.push({
              shelf_id: shelf_id,
              jan: validatedJAN,
              productName: validatedJAN, // 商品名の代わりにJANコードを表示
              source: 'handy_csv'
            });
            addedCount++;
          }
        }
      }
    });

    updateAdditionList();

    // 結果をユーザーに通知
    let resultMessage = `${addedCount}件のJANコードを読み込みました`;

    if (invalidJANs.length > 0) {
      resultMessage += `\n\n⚠️ ${invalidJANs.length}件のJANコードでエラーが発生しました：\n`;
      invalidJANs.forEach(item => {
        resultMessage += `行${item.lineNumber}: ${item.jan} - ${item.error}\n`;
      });
      resultMessage += '\n※ エラーが発生したJANコードはスキップされました。';
    }

    alert(resultMessage);
  };
  reader.onerror = () => alert("CSVの読み込みに失敗しました。");
  reader.readAsText(file, "UTF-8");
}

// 手入力追加
function handleManualJANAdd(shelf_id) {
  const janInput = document.getElementById("manualJAN");
  const jan = janInput.value.trim();

  // JANコードバリデーション
  const validation = validateJANCode(jan);
  if (!validation.valid) {
    // 無効入力はアラートなしでスキップ（QR誤読対策）
    janInput.value = '';
    janInput.focus();
    return;
  }

  const validatedJAN = validation.jan;

  // 重複チェック
  if (productAdditionList.some(item => item.jan === validatedJAN)) {
    janInput.value = '';
    janInput.focus();
    return;
  }

  productAdditionList.unshift({
    shelf_id: shelf_id,
    jan: validatedJAN,
    productName: validatedJAN, // 商品名の代わりにJANコードを表示
    source: 'manual_input' // 追加元の識別
  });

  updateAdditionList();
  janInput.value = '';
  janInput.focus();
}

// 追加予定商品リストの更新
function updateAdditionList() {
  const listElement = document.getElementById("additionListItems");
  listElement.innerHTML = "";

  if (productAdditionList.length === 0) {
    const li = document.createElement("li");
    li.style.textAlign = "center";
    li.style.color = "#666";
    li.style.fontStyle = "italic";
    li.textContent = "追加予定の商品はありません";
    listElement.appendChild(li);
  } else {
    productAdditionList.forEach((item, index) => {
      const li = document.createElement("li");

      const nameSpan = document.createElement("span");
      nameSpan.textContent = item.productName || item.jan;

      const janSpan = document.createElement("span");
      janSpan.textContent = `（${item.jan}）`;
      janSpan.style.marginLeft = "6px";
      janSpan.style.color = "#666";

      const delBtn = document.createElement("button");
      delBtn.textContent = "削除";
      delBtn.style.marginLeft = "8px";
      delBtn.onclick = () => {
        productAdditionList.splice(index, 1);
        updateAdditionList();
      };

      li.appendChild(nameSpan);
      li.appendChild(janSpan);
      li.appendChild(delBtn);
      listElement.appendChild(li);
    });
  }
}

// 登録処理
async function handleProductRegistration(shelf_id) {
  if (productAdditionList.length === 0) {
    alert("登録する商品がありません。");
    return;
  }

  try {
    const payload = {
      shelf_id: shelf_id,
      products: productAdditionList.map(p => ({ jan: p.jan }))
    };

    const resp = await fetch(`${API_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await resp.json();

    if (result && Array.isArray(result.results)) {
      const { successful, failed } = summarizeRegistrationResult(result.results, productAdditionList);

      let msg = `登録完了：\n  成功 ${successful.length} 件 / 失敗 ${failed.length} 件`;
      if (failed.length > 0) {
        msg += `\n\n失敗詳細：\n`;
        failed.forEach(fr => {
          msg += `・${fr.jan} : ${fr.error}\n`;
        });
      }
      alert(msg);

      // 成功分を画面から除外
      const successSet = new Set(successful.map(s => s.jan));
      productAdditionList = productAdditionList.filter(p => !successSet.has(p.jan));
      updateAdditionList();

      // 棚の状態を更新表示
      await showShelfProducts(shelf_id);
    } else {
      alert("登録結果の形式が不正です。");
    }
  } catch (e) {
    console.error("登録エラー:", e);
    alert("登録に失敗しました。");
  }
}

// 結果整形
function summarizeRegistrationResult(apiResults, originalList) {
  const successful = [];
  const failed = [];

  try {
    apiResults.forEach(result => {
      const originalProduct = originalList.find(p => p.jan === result.jan);
      if (!originalProduct) return;

      if (result.status === "success") {
        successful.push({
          ...originalProduct,
          status: result.status,
          id: result.id
        });
      } else {
        failed.push({
          ...originalProduct,
          status: result.status,
          id: result.id,
          error: getStatusMessage(result.status, result.jan)
        });
      }
    });

    return { successful, failed };

  } catch (error) {
    console.error('商品登録API実行エラー:', error);

    // エラー時は全件失敗扱い
    originalList.forEach(p => failed.push({
      ...p,
      status: 'error',
      error: '不明なエラーが発生しました'
    }));
    return { successful, failed };
  }
}

function getStatusMessage(status, jan) {
  switch (status) {
    case 'success': return '成功';
    case 'duplicate': return `重複（${jan} は既に登録済み）`;
    case 'invalid_jan': return '無効なJANコード';
    case 'not_found': return '商品情報が見つかりません';
    default: return 'エラー';
  }
}

// JANバリデーション（0埋め→チェック）
function validateJANCode(jan) {
  // 空チェック
  if (jan == null) {
    return { valid: false, message: 'JANコードを入力してください' };
  }
  const raw = String(jan).trim();
  if (raw === '') {
    return { valid: false, message: 'JANコードを入力してください' };
  }

  // 数字以外は無効
  if (!/^\d+$/.test(raw)) {
    return { valid: false, message: 'JANコードは数字のみで入力してください' };
  }

  // 長さ：1〜13桁を許容。14桁以上は無効
  if (raw.length > 13) {
    return { valid: false, message: 'JANコードは最大13桁までです' };
  }

  // 8桁 or 13桁以外は、13桁になるよう左0埋め
  let normalized = raw;
  if (raw.length !== 8 && raw.length !== 13) {
    normalized = raw.padStart(13, '0');
  }

  // 8桁の場合は EAN-8、13桁の場合は EAN-13 としてチェック
  const isValid = (normalized.length === 8) ? verifyEAN8(normalized)
                 : (normalized.length === 13) ? verifyEAN13(normalized)
                 : false;

  if (!isValid) {
    return { valid: false, message: 'チェックデジットが一致しません' };
  }

  return { valid: true, jan: normalized };
}

function verifyEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const base = code.slice(0, 12).split('').map(Number);
  const cd = Number(code[12]);
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const pos = i + 1;
    sum += base[i] * (pos % 2 === 0 ? 3 : 1);
  }
  const calc = (10 - (sum % 10)) % 10;
  return calc === cd;
}

function verifyEAN8(code) {
  if (!/^\d{8}$/.test(code)) return false;
  const base = code.slice(0, 7).split('').map(Number);
  const cd = Number(code[7]);
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    const pos = i + 1;
    sum += base[i] * (pos % 2 === 1 ? 3 : 1);
  }
  const calc = (10 - (sum % 10)) % 10;
  return calc === cd;
}

// CSV出力
function exportCSV() {
  if (selectedItems.length === 0) {
    alert("出力する商品が選択されていません。");
    return;
  }
  const header = ["shelf_id", "jan", "productName"];
  const rows = selectedItems.map(x => [x.shelf_id, x.jan, x.productName || ""]);
  const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "selected_products.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// UI更新（選択件数）
function updateSelectionUI() {
  const count = selectedItems.length;
  const btn = document.getElementById("exportBtn");
  btn.textContent = count > 0 ? `選択した商品をCSVで出力（${count}）` : "選択した商品をCSVで出力";
  document.getElementById("selectAllBtn").disabled = !(currentShelfData && currentShelfData.length > 0);
}

// マップクリア
function clearMap() {
  document.getElementById("mapContainer").innerHTML = "";
  currentDisplayedShelfId = null;
  currentShelfData = null;
  updateAddProductBtnState(false);
}
