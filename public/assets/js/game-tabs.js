function getMotionBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export function setupTabs({
  buttonSelector,
  panelSelector,
  buttonKey,
  panelKey,
  setButtonState,
  setPanelState,
  scrollPanel = false
}) {
  const buttons = [...document.querySelectorAll(buttonSelector)];
  const panels = [...document.querySelectorAll(panelSelector)];

  if (!buttons.length || !panels.length) {
    return { buttons, panels };
  }

  buttons.forEach((button, index) => {
    const panel = panels.find((item) => item.dataset[panelKey] === button.dataset[buttonKey]);
    button.type = 'button';
    button.id ||= `game-tab-${button.dataset[buttonKey]}-${index}`;
    if (panel) {
      panel.id ||= `${button.id}-panel`;
      button.setAttribute('aria-controls', panel.id);
      panel.setAttribute('aria-labelledby', button.id);
      panel.tabIndex = 0;
    }
  });

  const activate = (value) => {
    let activePanel = null;

    buttons.forEach((button) => {
      const active = button.dataset[buttonKey] === value;
      setButtonState(button, active);
      button.tabIndex = active ? 0 : -1;
    });

    panels.forEach((panel) => {
      const active = panel.dataset[panelKey] === value;
      setPanelState(panel, active);
      panel.hidden = !active;
      if (active) activePanel = panel;
    });

    if (scrollPanel && activePanel) {
      activePanel.scrollIntoView({
        block: 'nearest',
        behavior: getMotionBehavior()
      });
    }
  };

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => activate(button.dataset[buttonKey]));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activate(buttons[next].dataset[buttonKey]);
      buttons[next].focus();
    });
  });

  const initial = buttons.find((button) => button.getAttribute('aria-selected') === 'true') || buttons[0];
  // Initialize semantics without moving the document while a game loads.
  const shouldScroll = scrollPanel;
  scrollPanel = false;
  activate(initial.dataset[buttonKey]);
  scrollPanel = shouldScroll;

  return { buttons, panels, activate };
}
