(function () {
  var namespace = 'ldomenichelli.github.io';
  var path = window.location.pathname.replace(/\//g, '-');
  var url = 'https://api.countapi.xyz/hit/' + namespace + path + '/visits';
  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (res) {
      console.log('Page view:', res.value);
    })
    .catch(function (err) {
      console.error('CountAPI error:', err);
    });
})();
