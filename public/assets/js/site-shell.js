(function () {
  'use strict';

  var path = window.location.pathname;
  var body = document.body;
  var section = '';

  if (path === '/about/' || path.indexOf('/about/') === 0) {
    section = 'about';
  } else if (
    path.indexOf('/posts/') === 0 ||
    path.indexOf('/tags/') === 0 ||
    path.indexOf('/categories/') === 0 ||
    path.indexOf('/archives/') === 0 ||
    path.indexOf('/search/') === 0
  ) {
    section = 'notes';
  } else if (path.indexOf('/projects/') === 0 || path.indexOf('/games/') === 0) {
    section = 'projects';
  } else if (
    path.indexOf('/random/') === 0 ||
    path.indexOf('/library/') === 0 ||
    path.indexOf('/chamber-of-music/') === 0
  ) {
    section = 'hobbies';
  }

  if (section) {
    body.classList.add('section-' + section);
  }

  var header = document.querySelector('body > .header');
  if (header) {
    var nav = header.querySelector('.nav');
    var logo = header.querySelector('.logo a');
    var logoSwitches = header.querySelector('.logo-switches');
    var menu = header.querySelector('.menu, #menu');
    var trigger = header.querySelector('#menu-trigger');
    var items = [
      { key: 'about', label: 'about', href: '/about/' },
      { key: 'notes', label: 'notes', href: '/posts/' },
      { key: 'projects', label: 'projects', href: '/projects/' },
      { key: 'hobbies', label: 'hobbies', href: '/random/' }
    ];

    if (nav) {
      nav.setAttribute('aria-label', 'Primary');
    }

    if (logo) {
      logo.textContent = "lucia's room";
      logo.setAttribute('href', '/');
      logo.setAttribute('accesskey', 'h');
      logo.setAttribute('title', "lucia's room (Alt + H)");
    }

    if (logoSwitches) {
      logoSwitches.remove();
    }

    if (menu) {
      menu.id = 'site-menu';
      menu.classList.add('menu');
      menu.replaceChildren();

      items.forEach(function (item) {
        var li = document.createElement('li');
        var link = document.createElement('a');
        var label = document.createElement('span');

        link.href = item.href;
        link.title = item.label;
        label.textContent = item.label;

        if (item.key === section) {
          link.setAttribute('aria-current', 'page');
          label.className = 'active';
        }

        link.appendChild(label);
        li.appendChild(link);
        menu.appendChild(li);
      });
    }

    if (trigger && menu) {
      var mobileQuery = window.matchMedia('(max-width: 899px)');
      var syncExpanded = function () {
        trigger.setAttribute('aria-expanded', String(!menu.classList.contains('hidden')));
      };

      var collapseForMobile = function (event) {
        if ((event ? event.matches : mobileQuery.matches)) {
          menu.classList.add('hidden');
        }
      };

      trigger.setAttribute('type', 'button');
      trigger.setAttribute('aria-controls', 'site-menu');
      collapseForMobile();
      syncExpanded();
      new MutationObserver(syncExpanded).observe(menu, { attributes: true, attributeFilter: ['class'] });

      trigger.addEventListener('click', function (event) {
        event.stopImmediatePropagation();
        menu.classList.toggle('hidden');
      }, true);

      document.addEventListener('click', function (event) {
        if (!trigger.contains(event.target) && !menu.contains(event.target)) {
          menu.classList.add('hidden');
        }
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
          menu.classList.add('hidden');
          trigger.focus();
        }
      });

      if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', collapseForMobile);
      }
    }
  }

  var breadcrumbs = document.querySelector('.breadcrumbs');
  if (breadcrumbs && section) {
    var breadcrumbLinks = breadcrumbs.querySelectorAll('a');
    var parentLabel = section === 'notes' ? 'Notes' : section === 'projects' ? 'Projects' : section === 'hobbies' ? 'Hobbies' : 'About';

    breadcrumbLinks.forEach(function (link, index) {
      if (index > 0 && !link.textContent.trim()) {
        link.textContent = parentLabel;
      }
    });

    if (breadcrumbLinks.length === 1 && path !== '/' && path !== '/about/') {
      breadcrumbs.appendChild(document.createTextNode(' » '));
      var parent = document.createElement('a');
      parent.href = section === 'notes' ? '/posts/' : section === 'projects' ? '/projects/' : '/random/';
      parent.textContent = parentLabel;
      breadcrumbs.appendChild(parent);
    }
  }

  var footer = document.querySelector('body > .footer');
  if (footer) {
    var copyright = document.createElement('span');
    var home = document.createElement('a');
    var separator = document.createElement('span');
    var privacy = document.createElement('a');

    copyright.appendChild(document.createTextNode('© 2025–2026 '));
    home.href = '/';
    home.textContent = "lucia's room";
    copyright.appendChild(home);

    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '•';

    privacy.href = '/privacy/';
    privacy.textContent = 'privacy';

    if (path === '/') {
      home.setAttribute('aria-current', 'page');
    } else if (path === '/privacy/' || path === '/privacy') {
      privacy.setAttribute('aria-current', 'page');
    }

    footer.replaceChildren(copyright, separator, privacy);
    footer.classList.add('site-footer');
    footer.removeAttribute('style');
  }

  var themeColour = body.classList.contains('acl26-page') ? '#d9efe3' : '#dfe6d8';
  document.querySelectorAll('meta[name="theme-color"], meta[name="msapplication-TileColor"]').forEach(function (meta) {
    meta.setAttribute('content', themeColour);
  });
})();
