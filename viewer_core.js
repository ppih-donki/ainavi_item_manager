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
    clearThumbnailSelection();
  });
  document.getElementById("storeSelector").addEventListener("change", handleStoreChange);
  document.getElementById("floorSelector").addEventListener("change", handleFloorChange);
  document.getElementById("imageTypeSelect").addEventListener("change", handleMapTypeChange);
  document.getElementById("refreshDataBtn").addEventListener("click", handleRefreshData);

  document.getElementById("deleteSelectedBtn").addEventListener("click", handleDeleteSelected);

  // ズームコントロール
  document.getElementById("zoomInBtn").addEventListener("click", () => zoomMap(1.2));
  document.getElementById("zoomOutBtn").addEventListener("click", () => zoomMap(0.8));
  document.getElementById("resetZoomBtn").addEventListener("click", resetZoom);

  // 棚番号表示切り替え
  document.getElementById("toggleMarkersBtn").addEventListener("click", toggleMarkersVisibility);

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
  updateAddProductBtnState();

  // allDataの初期化
  allData = [];

  // 初期データをAPI経由で読み込み
  try {
    await loadStoresAndFloors();
    // 初期状態でメッセージを表示
    showMapMessage("店舗とフロアを選択してください");
  } catch (error) {
    console.error('初期データ読み込みエラー:', error);
  } finally {
    // ローディング状態を終了
    hideLoading();
  }
});

// ローディング表示
function showLoading() {
  showLoadingWithMessage("店舗・フロア情報を読み込み中...");
}

// カスタムメッセージでローディング表示
function showLoadingWithMessage(message) {
  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingText = document.querySelector(".loading-text");
  const mainContent = document.querySelectorAll("#controls, #main");

  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
  }

  if (loadingText) {
    loadingText.textContent = message;
  }

  // メインコンテンツを無効化
  mainContent.forEach(element => {
    element.classList.add("loading-active");
  });
}

// ローディング非表示
function hideLoading() {
  const loadingOverlay = document.getElementById("loadingOverlay");
  const mainContent = document.querySelectorAll("#controls, #main");

  if (loadingOverlay) {
    loadingOverlay.style.display = "none";
  }

  // メインコンテンツを有効化
  mainContent.forEach(element => {
    element.classList.remove("loading-active");
  });
}

// 上部の商品追加ボタンクリック処理
function handleAddProductBtnClick() {
  if (!currentDisplayedShelfId) {
    alert('商品を追加するには、まず棚を選択してください。\nマップ上のマーカーをクリックして棚を選択してから、再度お試しください。');
    return;
  }

  showProductAdditionModal(currentDisplayedShelfId);
}

// 上部の商品追加ボタンの状態を更新
function updateAddProductBtnState() {
  const addProductBtn = document.getElementById("addProductBtn");
  if (currentDisplayedShelfId) {
    addProductBtn.disabled = false;
    addProductBtn.textContent = "商品を追加";
  } else {
    addProductBtn.disabled = true;
    addProductBtn.textContent = "商品を追加（棚を選択してください）";
  }
}

// 上部の全選択ボタンの状態を更新
function updateSelectAllBtnState() {
  const selectAllBtn = document.getElementById("selectAllBtn");
  if (currentDisplayedShelfId && currentShelfData && currentShelfData.items && currentShelfData.items.length > 0) {
    selectAllBtn.disabled = false;
    selectAllBtn.textContent = `全て選択 (${currentShelfData.items.length}件)`;
  } else {
    selectAllBtn.disabled = true;
    selectAllBtn.textContent = "全て選択";
  }
}

// 店舗・フロア情報をAPIから取得
async function loadStoresAndFloors() {
  try {
    console.log('店舗・フロア情報の取得を開始...');

    const response = await fetch(API_URL + '/stores-with-floors', {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'shelf-API-Key': 'shelfsearchapikey'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    storesWithFloors = data.items || [];

    populateStoreSelect();
    console.log(`店舗・フロア情報を取得しました: ${data.count}件`);
  } catch (error) {
    console.error('店舗・フロア情報の取得に失敗しました:', error);
    alert('店舗・フロア情報の取得に失敗しました: ' + error.message);
  }
}

// 最新情報を取得
async function handleRefreshData() {
  if (!selectedStore || !selectedFloor) {
    alert('店舗とフロアを選択してください');
    return;
  }

  console.log('最新情報を取得ボタンが押されました');
  showLoading();
  try {
    await loadShelvesData();
  } finally {
    hideLoading();
  }
}

// 棚情報をAPIから取得
async function loadShelvesData() {
  try {
    console.log(`棚情報を取得中... (店舗: ${selectedStore}, フロア: ${selectedFloor})`);

    const response = await fetch(API_URL + `/shelves-with-product-flag?store_id=${selectedStore}&floor=${selectedFloor}&coord_src=pixel`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'shelf-API-Key': 'shelfsearchapikey'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    // 画像名を保存
    currentFloorImageName = data.floor_image_name;

    // 棚データを shelfLocationMap に保存
    shelfLocationMap = {};
    if (data.items) {
      data.items.forEach(item => {
        shelfLocationMap[item.shelf_id] = {
          x: item.X,
          y: item.Y,
          store_id: selectedStore,
          floor: selectedFloor,
          has_product: item.has_product
        };
      });
    }

    // マップを更新
    updateMapImage();

    console.log(`棚情報を取得しました: ${data.count}件`);
  } catch (error) {
    console.error('棚情報の取得に失敗しました:', error);
    alert('棚情報の取得に失敗しました: ' + error.message);
  }
}

// 選択商品削除
async function handleDeleteSelected() {
  if (selectedItems.length === 0) {
    alert("削除する商品が選択されていません");
    return;
  }

  // 棚番号を取得
  const shelfNumber = selectedItems[0].shelf_id.split("_")[2];

  // 削除対象商品の詳細を表示
  let confirmMsg = `棚${shelfNumber}の選択された${selectedItems.length}件の商品を削除しますか？\n（この操作は取り消せません）\n\n【削除対象商品一覧】\n`;
  selectedItems.forEach((item, index) => {
    confirmMsg += `${index + 1}. ${item.jan} - ${item.productName}\n`;
  });

  if (!confirm(confirmMsg)) return;

  try {
    showLoadingWithMessage("商品を削除中...");

    // 削除API呼び出し
    const result = await deleteAPI(selectedItems);

    // 成功時の処理
    const deletedCount = result.deletedCount;

    // 選択リストをクリア
    selectedItems = [];

    // 画面を完全にリフレッシュ（同じ店舗・フロア選択状態を維持）
    await refreshScreenAfterDeletion();

    alert(`${deletedCount}件の商品が削除されました`);
  } catch (error) {
    alert('削除エラー: ' + error.message);
  } finally {
    hideLoading();
  }
}

// 削除API
async function deleteAPI(items) {
  try {
    // 棚単位削除: 最初のアイテムの棚IDを使用
    const shelf_id = items[0].shelf_id;
    const jans = items.map(item => item.jan);

    console.log(`削除API実行: 棚${shelf_id}, JANコード${jans.length}件`);

    const response = await fetch(API_URL + '/placements', {
      method: 'DELETE',
      headers: {
        'accept': 'application/json',
        'shelf-API-Key': 'shelfsearchapikey',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shelf_id: shelf_id,
        JANs: jans
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`棚${shelf_id}の削除結果:`, result);

    return { success: true, deletedCount: jans.length };

  } catch (error) {
    console.error('削除API実行エラー:', error);
    throw error;
  }
}

// 削除後の画面リフレッシュ
async function refreshScreenAfterDeletion() {
  try {
    console.log('削除後の画面リフレッシュを開始...');

    // 1. 棚情報を再取得してマーカーを更新
    if (selectedStore && selectedFloor) {
      await loadShelvesData();
    }

    // 2. 現在表示中のサムネイルがあれば更新
    if (currentDisplayedShelfId) {
      await loadShelfProducts(currentDisplayedShelfId);
    }

    // 3. 選択状態をクリア（サムネイル赤枠解除）
    clearThumbnailSelection();

    console.log('削除後の画面リフレッシュが完了しました');
  } catch (error) {
    console.error('削除後の画面リフレッシュでエラー:', error);
  }
}

function populateStoreSelect() {
  const sel = document.getElementById("storeSelector");
  sel.innerHTML = "<option value=''>店舗選択</option>";
  storesWithFloors.forEach(store => {
    sel.append(new Option(store.store_id, store.store_id));
  });
}

function handleStoreChange(e) {
  selectedStore = e.target.value;
  selectedFloor = null; // フロア選択をリセット

  // 店舗切り替え時に右の商品リストと削除商品リストをクリア
  currentDisplayedShelfId = null;
  currentShelfData = null;
  selectedItems = []; // 削除商品リストをクリア
  updateAddProductBtnState();
  updateSelectAllBtnState();
  const imageContainer = document.getElementById("imageContainer");
  imageContainer.innerHTML = "";

  // マップ表示をクリアしてメッセージを表示
  showMapMessage("フロアを選択してください");

  populateFloorSelect();
}

// マップ中央にメッセージを表示
function showMapMessage(message) {
  const mapContainer = document.getElementById("mapContainer");
  mapContainer.innerHTML = `
    <div class="map-message">
      <div class="map-message-content">
        ${message}
      </div>
    </div>
  `;
}

function populateFloorSelect() {
  const sel = document.getElementById("floorSelector");
  sel.innerHTML = "<option value=''>フロア選択</option>";

  const selectedStoreData = storesWithFloors.find(store => store.store_id === selectedStore);
  if (selectedStoreData && selectedStoreData.floors) {
    selectedStoreData.floors.forEach(floor => {
      sel.append(new Option(floor, floor));
    });
  }
}

async function handleFloorChange(e) {
  selectedFloor = e.target.value;

  // 店舗・フロア切り替え時に右の商品リストと削除商品リストをクリア
  currentDisplayedShelfId = null;
  currentShelfData = null;
  selectedItems = []; // 削除商品リストをクリア
  updateAddProductBtnState();
  updateSelectAllBtnState();
  const imageContainer = document.getElementById("imageContainer");
  imageContainer.innerHTML = "";

  if (selectedStore && selectedFloor) {
    showLoading();
    try {
      await loadShelvesData();
    } finally {
      hideLoading();
    }
  }
}

function handleMapTypeChange(e) {
  selectedMapType = e.target.value;
  updateMapImage();
}

function updateMapImage() {
  const cont = document.getElementById("mapContainer");

  // ズームとパンをリセット
  resetZoom();

  // マップコンテンツの構造を作成
  const viewport = document.createElement("div");
  viewport.className = "map-viewport";

  const mapContent = document.createElement("div");
  mapContent.className = "map-content";
  mapContent.id = "mapContent";

  const img = document.createElement("img");

  // APIから取得した画像名を使用
  if (currentFloorImageName && selectedMapType === "map") {
    img.src = `images/${currentFloorImageName}`;
  } else {
    img.src = `images/${selectedStore.padStart(5, "0")}_${selectedFloor}_${selectedMapType}.jpg`;
  }

  img.onload = () => {
    renderMarkers(img);
    setupMapInteractions();
  };

  mapContent.appendChild(img);
  viewport.appendChild(mapContent);
  cont.innerHTML = "";
  cont.appendChild(viewport);

  mapContentElement = mapContent;
}

// マップのインタラクション設定
function setupMapInteractions() {
  const container = document.getElementById("mapContainer");
  const viewport = container.querySelector(".map-viewport");

  // マウスイベント
  viewport.addEventListener('mousedown', handleMouseDown);
  viewport.addEventListener('mousemove', handleMouseMove);
  viewport.addEventListener('mouseup', handleMouseUp);
  viewport.addEventListener('mouseleave', handleMouseUp);

  // ホイールイベント（ズーム）
  viewport.addEventListener('wheel', handleWheel);

  // タッチイベント（モバイル対応）
  viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
  viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
  viewport.addEventListener('touchend', handleTouchEnd);
}

// ズーム機能
function zoomMap(factor) {
  zoomLevel *= factor;
  zoomLevel = Math.max(0.5, Math.min(5, zoomLevel)); // 0.5倍から5倍まで
  updateMapTransform();
}

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  updateMapTransform();
}

// 棚番号の表示/非表示を切り替え
function toggleMarkersVisibility() {
  markersVisible = !markersVisible;
  const toggleBtn = document.getElementById("toggleMarkersBtn");

  // ボタンテキストの更新
  if (markersVisible) {
    toggleBtn.textContent = "棚番号を非表示";
  } else {
    toggleBtn.textContent = "棚番号を表示";
  }

  // 全マーカーの表示/非表示を切り替え
  allMarkers.forEach(marker => {
    if (markersVisible) {
      marker.style.display = "";
    } else {
      marker.style.display = "none";
    }
  });
}

function updateMapTransform() {
  if (mapContentElement) {
    mapContentElement.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;

    // ズームレベルに応じてマーカーサイズを更新
    allMarkers.forEach(marker => {
      updateMarkerSize(marker);
    });
  }
}

// マーカーサイズをズームレベルに応じて更新（ズームイン時は小さく、ズームアウト時は大きく）
function updateMarkerSize(marker) {
  marker.classList.remove('zoom-xlarge', 'zoom-large', 'zoom-medium', 'zoom-small', 'zoom-xsmall');

  // ズームレベルとマーカーサイズを逆相関にする
  if (zoomLevel >= 3.5) {
    marker.classList.add('zoom-xsmall'); // 最小
  } else if (zoomLevel >= 2.5) {
    marker.classList.add('zoom-small');
  } else if (zoomLevel >= 1.5) {
    marker.classList.add('zoom-medium');
  } else if (zoomLevel >= 1.0) {
    marker.classList.add('zoom-large');
  } else {
    marker.classList.add('zoom-xlarge'); // 最大
  }

  // マーカーの位置も再計算（中心座標を維持）
  updateMarkerPosition(marker);
}

// マーカーの位置を再計算（中心座標を維持）
function updateMarkerPosition(marker) {
  const originalX = parseFloat(marker.dataset.originalX);
  const originalY = parseFloat(marker.dataset.originalY);

  if (isNaN(originalX) || isNaN(originalY)) return;

  // 現在の画像のスケール情報を取得
  const mapImage = document.getElementById("mapImage");
  if (!mapImage) return;

  const imageNaturalWidth = mapImage.naturalWidth;
  const imageNaturalHeight = mapImage.naturalHeight;
  const imageDisplayWidth = mapImage.clientWidth;
  const imageDisplayHeight = mapImage.clientHeight;

  const scaleX = imageDisplayWidth / imageNaturalWidth;
  const scaleY = imageDisplayHeight / imageNaturalHeight;

  // 現在のマーカーサイズ
  const markerSize = getMarkerSize();

  // pixel座標にスケールを適用し、マーカーの中心が座標位置に来るよう調整
  const scaledX = originalX * scaleX;
  const scaledY = originalY * scaleY;

  // マーカーの中心を座標に合わせるため、サイズの半分だけオフセット
  marker.style.left = `${scaledX - markerSize / 2}px`;
  marker.style.top = `${scaledY - markerSize / 2}px`;
}

// 現在のズームレベルに応じたマーカーサイズを返す
function getMarkerSize() {
  if (zoomLevel >= 3.5) {
    return 8; // zoom-xsmall
  } else if (zoomLevel >= 2.5) {
    return 10; // zoom-small
  } else if (zoomLevel >= 1.5) {
    return 12; // zoom-medium
  } else if (zoomLevel >= 1.0) {
    return 14; // zoom-large
  } else {
    return 16; // zoom-xlarge
  }
}

// 指定エリアにズーム
function zoomToArea(centerX, centerY, targetZoom) {
  const container = document.getElementById("mapContainer");
  const containerRect = container.getBoundingClientRect();

  // 中心点を画面中央に配置するためのパン調整
  const targetPanX = containerRect.width / 2 - centerX * targetZoom;
  const targetPanY = containerRect.height / 2 - centerY * targetZoom;

  zoomLevel = Math.max(0.5, Math.min(5, targetZoom));
  panX = targetPanX;
  panY = targetPanY;

  updateMapTransform();
  isZoneSelectMode = false;
  toggleZoneSelectMode(); // UI状態をリセット
}

// 棚検索機能
function searchShelf() {
  const searchValue = document.getElementById("shelfSearchInput").value.trim();
  if (!searchValue) {
    alert("棚番号を入力してください");
    return;
  }

  // 既存のハイライトをクリア
  clearSearchHighlight();

  // 検索にマッチするマーカーを探す（完全一致）
  const matchedMarkers = allMarkers.filter(marker => {
    const shelfId = marker.dataset.shelfId;
    const shelfNumber = shelfId.split("_")[2];
    return shelfNumber === searchValue;
  });

  if (matchedMarkers.length === 0) {
    alert("該当する棚が見つかりませんでした");
    return;
  }

  // 他のマーカーを薄くする
  allMarkers.forEach(marker => {
    if (!matchedMarkers.includes(marker)) {
      marker.style.opacity = "0.3";
      marker.style.pointerEvents = "none";
    }
  });

  // マッチしたマーカーをハイライトして最前面に
  matchedMarkers.forEach(marker => {
    marker.classList.add("highlighted");
    marker.style.opacity = "1";
    marker.style.pointerEvents = "auto";
    searchHighlightedMarkers.push(marker);

    // 最前面に移動するため親要素から削除して再追加
    const parent = marker.parentNode;
    parent.removeChild(marker);
    parent.appendChild(marker);
  });

  console.log(`${matchedMarkers.length}件の棚が見つかりました: ${searchValue}`);
}

// 検索ハイライトをクリア
function clearSearchHighlight() {
  // ハイライトを解除し、全マーカーの表示を元に戻す
  allMarkers.forEach(marker => {
    marker.classList.remove("highlighted");
    marker.style.opacity = "1";
    marker.style.pointerEvents = "auto";
  });
  searchHighlightedMarkers = [];
}

// 全マーカー表示
function showAllMarkers() {
  clearSearchHighlight();
  resetZoom();
  document.getElementById("shelfSearchInput").value = "";
}

// 棚の商品情報をAPIから取得
async function loadShelfProducts(shelf_id) {
  try {
    showLoadingWithMessage("商品情報を読み込み中...");
    console.log(`商品情報を取得中... (棚ID: ${shelf_id})`);

    const response = await fetch(API_URL + `/shelf-products?shelf_id=${shelf_id}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'shelf-API-Key': 'shelfsearchapikey'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();

    // 商品データを表示
    displayProductThumbnails(data, shelf_id);

    console.log(`商品情報を取得しました: ${data.count}件`);
  } catch (error) {
    console.error('商品情報の取得に失敗しました:', error);

    // エラー時は空の商品リストを表示
    displayProductThumbnails({ count: 0, items: [] }, shelf_id);
    alert('商品情報の取得に失敗しました: ' + error.message);
  } finally {
    hideLoading();
  }
}

// マウスイベントハンドラー
function handleMouseDown(e) {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  document.getElementById("mapContainer").classList.add("dragging");
}

function handleMouseMove(e) {
  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;

  panX += deltaX;
  panY += deltaY;

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  updateMapTransform();
}

function handleMouseUp() {
  isDragging = false;
  document.getElementById("mapContainer").classList.remove("dragging");
}

// ホイールイベント（ズーム）
function handleWheel(e) {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  zoomMap(factor);
}

// タッチイベント（ピンチズーム対応）
let lastTouchDistance = 0;

function handleTouchStart(e) {
  // Allow taps on markers to generate synthetic click events on mobile
  if (e.target && typeof e.target.closest === 'function' && e.target.closest('.marker')) {
    return;
  }
  e.preventDefault();

  if (e.touches.length === 1) {
    // 単指でのパン
    isDragging = true;
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    // 二指でのズーム
    isDragging = false;
    lastTouchDistance = getTouchDistance(e.touches);
  }
}

function handleTouchMove(e) {
  e.preventDefault();

  if (e.touches.length === 1 && isDragging) {
    // パン
    const deltaX = e.touches[0].clientX - lastMouseX;
    const deltaY = e.touches[0].clientY - lastMouseY;

    panX += deltaX;
    panY += deltaY;

    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;

    updateMapTransform();
  } else if (e.touches.length === 2) {
    // ピンチズーム
    const currentDistance = getTouchDistance(e.touches);
    const factor = currentDistance / lastTouchDistance;

    if (Math.abs(factor - 1) > 0.02) { // 閾値を設けて不要な更新を避ける
      zoomMap(factor);
      lastTouchDistance = currentDistance;
    }
  }
}

function handleTouchEnd(e) {
  isDragging = false;
  lastTouchDistance = 0;
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function renderMarkers(mapImage) {
  document.querySelectorAll(".marker").forEach(m => m.remove());
  allMarkers = []; // マーカー参照をリセット

  // pixel座標対応：画像の実際のサイズと表示サイズの比率を計算
  const imageNaturalWidth = mapImage.naturalWidth;
  const imageNaturalHeight = mapImage.naturalHeight;
  const imageDisplayWidth = mapImage.clientWidth;
  const imageDisplayHeight = mapImage.clientHeight;

  const scaleX = imageDisplayWidth / imageNaturalWidth;
  const scaleY = imageDisplayHeight / imageNaturalHeight;

  console.log(`画像情報: 実サイズ ${imageNaturalWidth}x${imageNaturalHeight}, 表示サイズ ${imageDisplayWidth}x${imageDisplayHeight}, スケール ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);

  // 現在の店舗・フロアの棚のみを表示（shelfLocationMapを使用）
  const currentShelves = Object.entries(shelfLocationMap)
    .filter(([shelf_id, shelfData]) => shelfData.store_id === selectedStore && shelfData.floor === selectedFloor);

  console.log(`renderMarkers: ${currentShelves.length}個の棚を表示します (店舗: ${selectedStore}, フロア: ${selectedFloor})`);

  // 棚アイコンを指定された位置にそのまま表示
  currentShelves.forEach(([shelf_id, shelfData]) => {
    // APIから取得したhas_productフラグを使用
    const hasProducts = shelfData.has_product === 1;

    const m = document.createElement("div");
    m.className = `marker ${hasProducts ? 'marker-with-products' : 'marker-empty'}`;
    m.textContent = shelf_id.split("_")[2];
    m.dataset.shelfId = shelf_id;
    m.dataset.hasProducts = hasProducts.toString();
    // 座標データを保存（ズーム時の位置再計算用）
    m.dataset.originalX = shelfData.x;
    m.dataset.originalY = shelfData.y;

    // ズームレベルに応じたマーカーサイズクラスを追加
    updateMarkerSize(m);

    // ズームレベルに応じたマーカーサイズを取得
    const markerSize = getMarkerSize();

    // pixel座標にスケールを適用し、マーカーの中心が座標位置に来るよう調整
    const scaledX = shelfData.x * scaleX;
    const scaledY = shelfData.y * scaleY;

    // マーカーの中心を座標に合わせるため、サイズの半分だけオフセット
    m.style.left = `${scaledX - markerSize / 2}px`;
    m.style.top = `${scaledY - markerSize / 2}px`;

    // 現在の表示状態を適用
    if (!markersVisible) {
      m.style.display = "none";
    }

    m.addEventListener("click", async (e) => {
      // 棚移動時は商品選択状態をクリア
      if (currentDisplayedShelfId !== shelf_id) {
        selectedItems = [];
        updateSelectionUI();
      }

      // 棚選択処理 - APIから最新の商品データを取得
      await loadShelfProducts(shelf_id);
    });

    // マップコンテンツ内にマーカーを追加
    const mapContent = document.getElementById("mapContent");
    if (mapContent) {
      mapContent.appendChild(m);
      allMarkers.push(m); // 参照を保持
    }
  });
}

// 新しい商品表示関数（APIデータ使用）
function displayProductThumbnails(apiData, shelf_id) {
  const cont = document.getElementById("imageContainer");
  cont.innerHTML = "";

  // 現在表示中の棚IDとデータを記録
  currentDisplayedShelfId = shelf_id;
  currentShelfData = apiData;

  // 上部の商品追加ボタンと全選択ボタンを有効化
  updateAddProductBtnState();
  updateSelectAllBtnState();

  // 1行目：指示文
  const instr = document.createElement("div");
  instr.className = "thumbnail-instruction";
  instr.textContent = "削除する商品をクリックしてください（選択後、選択商品を削除ボタンで一括削除可能）";
  cont.appendChild(instr);

  // 2行目：選択済み番号
  const markerNo = shelf_id.split("_")[2];
  const selDisp = document.createElement("div");
  selDisp.id = "selectedMarkerDisplay";
  selDisp.textContent = `選択済み棚番号：${markerNo} (商品${apiData.count}件)`;
  cont.appendChild(selDisp);

  // 3行目：カテゴリ別品数表示
  if (apiData.items && apiData.items.length > 0) {
    const categoryDisplay = createCategoryCountDisplay(apiData.items);
    cont.appendChild(categoryDisplay);
  }

  // 4行目：サムネイルリスト
  const list = document.createElement("div");
  list.className = "thumb-list";

  // 商品追加ボタン（+マーク）を最初に追加
  const addBox = document.createElement("div");
  addBox.className = "thumb-box add-product-box";
  addBox.style.backgroundColor = "#f0f8ff";
  addBox.style.border = "2px dashed #4CAF50";
  addBox.style.cursor = "pointer";
  addBox.addEventListener("click", () => showProductAdditionModal(shelf_id));

  const addIcon = document.createElement("div");
  addIcon.style.fontSize = "48px";
  addIcon.style.color = "#4CAF50";
  addIcon.style.textAlign = "center";
  addIcon.style.lineHeight = "1";
  addIcon.style.marginTop = "20px";
  addIcon.textContent = "+";

  const addLabel = document.createElement("div");
  addLabel.className = "jan-label";
  addLabel.textContent = "商品を追加";
  addLabel.style.textAlign = "center";
  addLabel.style.marginTop = "10px";
  addLabel.style.fontWeight = "bold";

  addBox.append(addIcon, addLabel);
  list.appendChild(addBox);

  // APIから取得した商品データをカテゴリ順でソートしてから表示
  if (apiData.items && apiData.items.length > 0) {
    const sortedProducts = [...apiData.items].sort((a, b) => {
      const categoryA = a.category || "（カテゴリ不明）";
      const categoryB = b.category || "（カテゴリ不明）";
      return categoryA.localeCompare(categoryB);
    });

    sortedProducts.forEach(product => {
      const janCode = product.JAN;
      const productName = product.item_name || "（商品名不明）";
      const category = product.category || "（カテゴリ不明）";
      const thumbnailUrl = product.thumbnail_data_url;

      const box = document.createElement("div");
      box.className = "thumb-box";

      // 選択済みの商品をハイライト
      if (selectedItems.some(item => item.shelf_id === shelf_id && item.jan === janCode)) {
        box.style.border = "3px solid #ff4444";
        box.style.backgroundColor = "#ffe6e6";
      }

      box.addEventListener("click", () => addSelectedItem(shelf_id, janCode, productName, category));

      const img = document.createElement("img");
      // APIから取得したサムネイル画像を使用
      if (thumbnailUrl && thumbnailUrl.startsWith("data:image/")) {
        img.src = thumbnailUrl;
      } else {
        // フォールバック用のNo Image
        img.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzk5OSIgZm9udC1zaXplPSIxMiI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPg==";
      }
      img.alt = productName;
      img.onerror = () => {
        img.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjZjBmMGYwIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzk5OSIgZm9udC1zaXplPSIxMiI+Tm8gSW1hZ2U8L3RleHQ+Cjwvc3ZnPg==";
      };

      const lblJan = document.createElement("div");
      lblJan.className = "jan-label";
      lblJan.textContent = janCode;

      const lblName = document.createElement("div");
      lblName.className = "jan-label";
      // 商品名を45文字で省略
      const truncatedName = productName.length > 45
        ? productName.substring(0, 45) + "..."
        : productName;
      lblName.textContent = truncatedName;

      const lblCategory = document.createElement("div");
      lblCategory.className = "jan-label";
      lblCategory.style.fontSize = "10px";
      lblCategory.style.color = "#666";
      lblCategory.textContent = category;

      box.append(img, lblJan, lblName, lblCategory);
      list.appendChild(box);
    });
  }

  cont.appendChild(list);
}

function addSelectedItem(shelf_id, jan, productName, category) {
  const existingIndex = selectedItems.findIndex(i => i.shelf_id === shelf_id && i.jan === jan);

  if (existingIndex === -1) {
    // 新しく追加
    selectedItems.unshift({ shelf_id, jan, productName, category: category || "（カテゴリ不明）" });
  } else {
    // 既に選択されている場合は削除（トグル動作）
    selectedItems.splice(existingIndex, 1);
  }

  updateSelectionUI();
  updateCategoryButtonStates();

  // サムネイル表示の赤枠のみを更新
  updateThumbnailSelection(shelf_id);
}

function updateSelectionUI() {
  // 削除ボタンの状態を更新
  const deleteBtn = document.getElementById("deleteSelectedBtn");
  deleteBtn.disabled = false; // 常にクリック可能にして、handleDeleteSelected内でチェック
  deleteBtn.textContent = `選択商品を削除${selectedItems.length > 0 ? ` (${selectedItems.length}件)` : ''}`;
}

// 現在表示中のサムネイルを再表示して赤枠を更新
async function refreshCurrentThumbnails() {
  const imageContainer = document.getElementById("imageContainer");
  const thumbBoxes = imageContainer.querySelectorAll(".thumb-box");

  // 表示中のサムネイルがある場合、赤枠を即座に解除
  if (thumbBoxes.length > 0) {
    thumbBoxes.forEach(box => {
      box.style.border = "";
      box.style.backgroundColor = "";
    });
  }

  // 現在表示中の棚IDが記録されている場合のみ再描画（非同期で実行）
  if (currentDisplayedShelfId) {
    loadShelfProducts(currentDisplayedShelfId).catch(console.error);
  }
}

// サムネイル選択状態の更新：赤枠の表示/非表示のみ
function updateThumbnailSelection(shelf_id) {
  const imageContainer = document.getElementById("imageContainer");
  const thumbBoxes = imageContainer.querySelectorAll(".thumb-box:not(.add-product-box)");

  thumbBoxes.forEach(box => {
    // JANコードを取得（box内のjan-labelから）
    const janLabel = box.querySelector(".jan-label");
    if (!janLabel) return;

    const janCode = janLabel.textContent.trim();

    // 選択済みかどうかをチェック
    const isSelected = selectedItems.some(item => item.shelf_id === shelf_id && item.jan === janCode);

    if (isSelected) {
      // 選択済みの場合は赤枠を表示
      box.style.border = "3px solid #ff4444";
      box.style.backgroundColor = "#ffe6e6";
    } else {
      // 未選択の場合は赤枠を解除
      box.style.border = "";
      box.style.backgroundColor = "";
    }
  });
}

// 選択解除用：赤枠のみクリアしてAPI再取得は行わない
function clearThumbnailSelection() {
  const imageContainer = document.getElementById("imageContainer");
  const thumbBoxes = imageContainer.querySelectorAll(".thumb-box:not(.add-product-box)");

  // 表示中のサムネイルがある場合、赤枠を即座に解除（商品追加ボタンは除外）
  if (thumbBoxes.length > 0) {
    thumbBoxes.forEach(box => {
      box.style.border = "";
      box.style.backgroundColor = "";
    });
  }
}

// カテゴリ別品数表示を作成
function createCategoryCountDisplay(items) {
  // カテゴリごとの品数をカウント
  const categoryCount = {};
  items.forEach(item => {
    const category = item.category || "（カテゴリ不明）";
    categoryCount[category] = (categoryCount[category] || 0) + 1;
  });

  // カテゴリをアルファベット順でソート
  const sortedCategories = Object.keys(categoryCount).sort((a, b) => a.localeCompare(b));

  const container = document.createElement("div");
  container.className = "category-count-display";

  const title = document.createElement("div");
  title.className = "category-count-title";
  title.textContent = "カテゴリ別品数 (クリックで選択):";
  container.appendChild(title);

  const countsContainer = document.createElement("div");
  countsContainer.className = "category-counts";

  sortedCategories.forEach(category => {
    const countButton = document.createElement("button");
    countButton.className = "category-count-button";
    countButton.textContent = `${category}: ${categoryCount[category]}件`;
    countButton.dataset.category = category;
    countButton.addEventListener("click", () => selectProductsByCategory(category, currentDisplayedShelfId));
    countsContainer.appendChild(countButton);
  });

  container.appendChild(countsContainer);
  return container;
}

// 棚の全商品を一括選択
function selectAllProducts(apiData, shelf_id) {
  if (!apiData.items || apiData.items.length === 0) {
    alert("選択可能な商品がありません");
    return;
  }

  // 現在の棚の商品をすべて選択リストに追加
  apiData.items.forEach(product => {
    const janCode = product.JAN;
    const productName = product.item_name || "（商品名不明）";
    const category = product.category || "（カテゴリ不明）";

    // 既に選択済みでない場合のみ追加
    const existingIndex = selectedItems.findIndex(i => i.shelf_id === shelf_id && i.jan === janCode);
    if (existingIndex === -1) {
      selectedItems.push({ shelf_id, jan: janCode, productName, category });
    }
  });

  // UI更新
  updateSelectionUI();
  updateThumbnailSelection(shelf_id);
  updateCategoryButtonStates();

  console.log(`${apiData.items.length}件の商品を一括選択しました`);
}

// 指定カテゴリの商品を選択/解除（トグル機能）
function selectProductsByCategory(category, shelf_id) {
  if (!currentShelfData || !currentShelfData.items) {
    alert("商品データが見つかりません");
    return;
  }

  // 指定カテゴリの商品をフィルタリング
  const categoryProducts = currentShelfData.items.filter(product => {
    const productCategory = product.category || "（カテゴリ不明）";
    return productCategory === category;
  });

  if (categoryProducts.length === 0) {
    alert(`${category}の商品が見つかりません`);
    return;
  }

  // 該当カテゴリの商品が既に選択されているかチェック
  const selectedCategoryProducts = categoryProducts.filter(product => {
    const janCode = product.JAN;
    return selectedItems.some(item => item.shelf_id === shelf_id && item.jan === janCode);
  });

  const isAllSelected = selectedCategoryProducts.length === categoryProducts.length;

  if (isAllSelected) {
    // 全て選択済み → 選択解除
    categoryProducts.forEach(product => {
      const janCode = product.JAN;
      const existingIndex = selectedItems.findIndex(i => i.shelf_id === shelf_id && i.jan === janCode);
      if (existingIndex !== -1) {
        selectedItems.splice(existingIndex, 1);
      }
    });
    console.log(`${category}の${categoryProducts.length}件の商品の選択を解除しました`);
  } else {
    // 一部または未選択 → 全て選択
    categoryProducts.forEach(product => {
      const janCode = product.JAN;
      const productName = product.item_name || "（商品名不明）";
      const productCategory = product.category || "（カテゴリ不明）";

      // 既に選択済みでない場合のみ追加
      const existingIndex = selectedItems.findIndex(i => i.shelf_id === shelf_id && i.jan === janCode);
      if (existingIndex === -1) {
        selectedItems.push({ shelf_id, jan: janCode, productName, category: productCategory });
      }
    });
    console.log(`${category}の${categoryProducts.length}件の商品を選択しました`);
  }

  // UI更新
  updateSelectionUI();
  updateThumbnailSelection(shelf_id);
  updateCategoryButtonStates();
}

// カテゴリボタンの状態を更新
function updateCategoryButtonStates() {
  if (!currentShelfData || !currentDisplayedShelfId) return;

  const categoryButtons = document.querySelectorAll('.category-count-button');

  categoryButtons.forEach(button => {
    const category = button.dataset.category;

    // 該当カテゴリの商品をフィルタリング
    const categoryProducts = currentShelfData.items.filter(product => {
      const productCategory = product.category || "（カテゴリ不明）";
      return productCategory === category;
    });

    // 該当カテゴリの商品が選択されているかチェック
    const selectedCategoryProducts = categoryProducts.filter(product => {
      const janCode = product.JAN;
      return selectedItems.some(item => item.shelf_id === currentDisplayedShelfId && item.jan === janCode);
    });

    const isAllSelected = selectedCategoryProducts.length === categoryProducts.length && categoryProducts.length > 0;
    const isPartiallySelected = selectedCategoryProducts.length > 0 && selectedCategoryProducts.length < categoryProducts.length;

    // ボタンの状態に応じてスタイルを変更
    button.classList.remove('category-selected', 'category-partial');
    if (isAllSelected) {
      button.classList.add('category-selected');
    } else if (isPartiallySelected) {
      button.classList.add('category-partial');
    }
  });
}

// 商品追加モーダル表示
function showProductAdditionModal(shelf_id) {
  const modal = document.getElementById("productAdditionModal");
  const shelfInfo = document.getElementById("modalShelfInfo");
  const markerNo = shelf_id.split("_")[2];

  shelfInfo.textContent = `棚番号: ${markerNo} (${shelf_id})`;

  // モーダル内のグローバル変数をリセット
  productAdditionList = [];
  updateAdditionList();

  // ラジオボタンの初期設定
  document.getElementById("methodManual").checked = true;
　toggleInputMethod();

  modal.style.display = "block";

  // イベントリスナーを設定（重複登録を避けるため一度削除）
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
}

// 入力方法切り替え
function toggleInputMethod() {
  const isHandy = document.getElementById("methodHandy").checked;
  document.getElementById("handyTerminalInput").style.display = isHandy ? "block" : "none";
  document.getElementById("manualInput").style.display = isHandy ? "none" : "block";
}

// ハンディターミナルCSVファイルの処理
function handleHandyCSVUpload(event, shelf_id) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      // ArrayBufferとして読み込んでShift_JIS（CP932）でデコード
      const buffer = e.target.result;
      const decoder = new TextDecoder('shift_jis');
      const csvText = decoder.decode(buffer);

      const lines = csvText.split('\n').filter(line => line.trim());
      let addedCount = 0;
      const invalidJANs = []; // バリデーションエラーが発生したJANコードを記録

      // ヘッダー行をスキップして処理
      lines.slice(1).forEach((line, index) => {
        const columns = parseCSVLine(line);
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
                source: 'handy_terminal' // 追加元の識別
              });
              addedCount++;
            } else {
              // 既存の場合はカウントのみ増加
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
    } catch (error) {
      alert('CSVファイルの読み込みに失敗しました: ' + error.message);
    } finally {
      // 処理完了後にファイル入力をリセット（同じファイルの再選択を可能にする）
      event.target.value = '';
    }
  };

  // ArrayBufferとして読み込み
  reader.readAsArrayBuffer(file);
}

// 手動JANコード追加
// CSV行を適切に解析する関数（ダブルクォート対応）
function parseCSVLine(line) {
  const columns = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // エスケープされたクォート（""）
        current += '"';
        i++; // 次の文字をスキップ
      } else {
        // クォートの開始/終了
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // クォート外のカンマ → 列の区切り
      columns.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // 最後の列を追加
  columns.push(current);
  return columns;
}

// JANコードバリデーション関数
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

  // 13桁未満は左ゼロ埋め
  const normalized = raw.padStart(13, '0');
  return { valid: true, jan: normalized };
}

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

      const span = document.createElement("span");
      span.textContent = `JAN: ${item.jan}`;

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "削除";
      deleteBtn.style.color = "red";
      deleteBtn.style.fontSize = "12px";
      deleteBtn.style.padding = "2px 8px";
      deleteBtn.onclick = () => removeFromAdditionList(index);

      li.appendChild(span);
      li.appendChild(deleteBtn);
      listElement.appendChild(li);
    });
  }

  const registerBtn = document.getElementById("registerProductsBtn");
  registerBtn.disabled = productAdditionList.length === 0;
  registerBtn.textContent = `商品登録 (${productAdditionList.length}件)`;
}

// 追加リストから商品を削除
function removeFromAdditionList(index) {
  productAdditionList.splice(index, 1);
  updateAdditionList();
}

// 商品登録実行
function handleProductRegistration(shelf_id) {
  if (productAdditionList.length === 0) {
    alert('登録する商品がありません');
    return;
  }

  if (!confirm(`${productAdditionList.length}件の商品を登録しますか？`)) {
    return;
  }

  // 商品登録API呼び出し
  productRegistrationAPI(productAdditionList)
    .then(result => {
      displayRegistrationResult(result);
      closeProductAdditionModal();

      // 商品追加完了
      console.log(`${result.successful.length}件の商品が正常に登録されました`);

      // マップを再描画してマーカーを更新（棚情報を最新化）
      if (selectedStore && selectedFloor) {
        loadShelvesData().catch(console.error);
      }

      // サムネイルを更新（非同期で実行）
      if (currentDisplayedShelfId === shelf_id) {
        loadShelfProducts(shelf_id).catch(console.error);
      }
    })
    .catch(error => {
      alert('商品登録でエラーが発生しました: ' + error.message);
    });
}

// 商品登録API
async function productRegistrationAPI(products) {
  try {
    // 商品リストから shelf_id を取得
    const shelf_id = products[0].shelf_id;

    // JANコードのリストを作成
    const jans = products.map(product => product.jan);

    console.log(`商品登録API実行: 棚${shelf_id}, JANコード${jans.length}件`);

    const response = await fetch(API_URL + '/placements', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'shelf-API-Key': 'shelfsearchapikey',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shelf_id: shelf_id,
        JANs: jans
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const apiResult = await response.json();
    console.log('商品登録APIレスポンス:', apiResult);

    // APIレスポンスを既存のフォーマットに変換
    const successful = [];
    const failed = [];

    apiResult.results.forEach(result => {
      const originalProduct = products.find(p => p.jan === result.jan);

      if (result.status === 'created') {
        // 成功したアイテム
        successful.push({
          ...originalProduct,
          status: result.status,
          id: result.id
        });
      } else {
        // 失敗したアイテム（created以外）
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

    // エラー時は全ての商品を失敗として返す
    const failed = products.map(product => ({
      ...product,
      error: `API呼び出しエラー: ${error.message}`
    }));

    return { successful: [], failed };
  }
}

// ステータスメッセージを取得
function getStatusMessage(status, jan) {
  switch (status) {
    case 'created':
      return '新規登録が完了しました';
    case 'skipped_existing':
      return '既に登録済みの商品のためスキップしました';
    case 'invalid_jan':
      return 'JANコードの形式が無効です（13桁の数字である必要があります）';
    case 'not_in_product_master':
      return '商品マスターに該当するJANコードが存在しません';
    case 'skipped_no_shelf_xy':
      return '指定された棚IDが存在しません';
    case 'error':
      return 'システムエラーが発生しました';
    default:
      return `不明なステータス: ${status}`;
  }
}

// 登録結果表示
function displayRegistrationResult(result) {
  const { successful, failed } = result;

  // 成功数（created）と失敗数を集計
  const createdCount = successful.filter(item => item.status === 'created').length;
  const otherSuccessfulCount = successful.length - createdCount;

  let message = `商品登録処理完了\n\n`;
  message += `新規登録（created）: ${createdCount}件\n`;

  if (otherSuccessfulCount > 0) {
    message += `その他成功: ${otherSuccessfulCount}件\n`;
  }

  message += `失敗: ${failed.length}件`;

  // 成功した商品のステータス詳細（created以外）
  if (otherSuccessfulCount > 0) {
    message += '\n\n【処理完了した商品（新規登録以外）】\n';
    successful.filter(item => item.status !== 'created').forEach(item => {
      message += `${item.jan}: ${getStatusMessage(item.status, item.jan)}\n`;
    });
  }

  // 失敗した商品の詳細
  if (failed.length > 0) {
    message += '\n\n【失敗した商品】\n';
    failed.forEach(item => {
      message += `${item.jan}: ${item.error}\n`;
    });
  }

  // 総合結果の判定
  if (failed.length === 0) {
    if (createdCount > 0) {
      message = `✅ ${message}`;
    } else {
      message = `⚠️ ${message}`;
    }
  } else {
    message = `❌ ${message}`;
  }

  alert(message);

  // 結果をCSVで保存
  saveRegistrationResultToCSV(result);
}

// 登録結果をCSVで保存
function saveRegistrationResultToCSV(result) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // BOM付きでcp932エンコーディング対応のCSVを作成
  let csv = "\ufeffresult_type,jan,shelf_id,source,api_status,api_id,message\n";

  result.successful.forEach(item => {
    const source = item.source || 'unknown';
    const apiStatus = item.status || 'unknown';
    const apiId = item.id || '';
    const message = getStatusMessage(apiStatus, item.jan);

    csv += `"successful","${item.jan}","${item.shelf_id}","${source}","${apiStatus}","${apiId}","${message.replace(/"/g, '""')}"\n`;
  });

  result.failed.forEach(item => {
    const source = item.source || 'unknown';
    const apiStatus = item.status || 'unknown';
    const apiId = item.id || '';
    const message = item.error || '';

    csv += `"failed","${item.jan}","${item.shelf_id}","${source}","${apiStatus}","${apiId}","${message.replace(/"/g, '""')}"\n`;
  });

  // BOM付きBlobでcp932（Shift_JIS）を指定
  const blob = new Blob([csv], {
    type: "text/csv;charset=shift_jis"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `商品登録結果_${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportCSV() {
  if (!selectedItems.length) return alert("項目が選択されていません");

  // BOM付きでcp932エンコーディング対応のCSVを作成
  let csv = "\ufeffshelf_id,jan,ProductName\n";

  selectedItems.forEach(i => {
    // Excel対応のためのカンマとクォート処理
    const safeName = `"${i.productName.replace(/"/g, '""')}"`;
    csv += `"${i.shelf_id}","${i.jan}",${safeName}\n`;
  });

  // BOM付きBlobでcp932（Shift_JIS）を指定
  const blob = new Blob([csv], {
    type: "text/csv;charset=shift_jis"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "誤登録商品リスト.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
