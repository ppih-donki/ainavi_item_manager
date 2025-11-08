(function(){
  // --- 複数ID/パス対応（大小文字区別・完全一致） ---
  // 追加・削除はこのオブジェクトを書き換えるだけ
  var CREDENTIALS = {
    '0160008': 'Donki0160008',
    '92'  : 'Donki92',
    '278'  : 'Donki278',
    '373'  : 'Donki373',
    '442'  : 'Donki442',
    '555'  : 'Donki555'
  };

  var KEY = 'aiNavSession';
  var ONE_DAY = 24*60*60*1000;

  function isValidSession(o){
    try{
      return !!(o && o.issuedAt && (Date.now()-o.issuedAt) <= ONE_DAY);
    }catch(e){ return false; }
  }

  function redirectToApp(){ location.replace('./index.html'); }

  // 既に有効セッションがあればアプリへ
  try{
    var raw = localStorage.getItem(KEY);
    if(raw){
      var obj = JSON.parse(raw||'{}');
      if(isValidSession(obj)){ redirectToApp(); return; }
    }
  }catch(e){ /* ignore */ }

  function login(){
    var id = document.getElementById('uid').value.trim();
    var pw = document.getElementById('pw').value;
    var err = document.getElementById('err');

    if(!id || !pw){
      err.textContent = 'ID とパスワードを入力してください。';
      return;
    }

    // 認証：ID存在かつパス一致
    var expected = Object.prototype.hasOwnProperty.call(CREDENTIALS, id) ? CREDENTIALS[id] : null;
    if(expected && pw === expected){
      var token = (Math.random().toString(36).slice(2)) + (Date.now().toString(36));
      var obj = { token: token, issuedAt: Date.now(), uid: id }; // uidは参照用。既存ガードに影響なし
      try{ localStorage.setItem(KEY, JSON.stringify(obj)); }catch(e){ /* storage blocked */ }
      redirectToApp();
    }else{
      err.textContent = 'ID またはパスワードが違います。';
    }
  }

  window.addEventListener('DOMContentLoaded', function(){
    var btn = document.getElementById('go');
    var pwI = document.getElementById('pw');
    if(btn) btn.addEventListener('click', login);
    if(pwI) pwI.addEventListener('keydown', function(ev){
      if(ev.key === 'Enter') login();
    });
  });
})();
