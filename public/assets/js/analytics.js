(function () {
  var namespace = 'ldomenichelli.github.io';
  var path = window.location.pathname.replace(/\//g, '-');
  var url = 'https://api.countapi.xyz/hit/' + namespace + path + '/visits';
  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (res) {
      console.log('Page view:', res.value);
      var img = document.createElement('img');
      img.id = 'visitor-counter';
      img.alt = 'You are visitor number ' + res.value;
      img.src = 'https://img.shields.io/badge/you%20are%20visitor%20number-' + res.value + '-blue';
      document.body.appendChild(img);
    })
    .catch(function (err) {
      console.error('CountAPI error:', err);
    });
})();
