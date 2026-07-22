// 웹(ryuology) 배포용 미니 셤 — MSU Arcade SDK 대체.
// ready는 영원히 pending(게임이 1.5초 타임아웃 후 오프라인 모드로 진행),
// save는 localStorage로 로컬 베스트만 지원한다.
(function () {
  var NS = 'raf-web:';
  window.Arcade = {
    ready: function () { return new Promise(function () {}); },
    save: {
      set: function (k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(); },
      get: function (k) {
        try {
          var s = localStorage.getItem(NS + k);
          return Promise.resolve(s == null ? null : JSON.parse(s));
        } catch (e) { return Promise.resolve(null); }
      },
      remove: function (k) { try { localStorage.removeItem(NS + k); } catch (e) {} return Promise.resolve(); },
      keys: function () { return Promise.resolve([]); }
    }
  };
})();
