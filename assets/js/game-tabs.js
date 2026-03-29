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
  scrollPanel = true
}) {
  const buttons = [...document.querySelectorAll(buttonSelector)];
  const panels = [...document.querySelectorAll(panelSelector)];

  if (!buttons.length || !panels.length) {
    return { buttons, panels };
  }

  const activate = (value) => {
    let activePanel = null;

    buttons.forEach((button) => {
      const active = button.dataset[buttonKey] === value;
      setButtonState(button, active);
    });

    panels.forEach((panel) => {
      const active = panel.dataset[panelKey] === value;
      setPanelState(panel, active);
      if (active) activePanel = panel;
    });

    if (scrollPanel && activePanel) {
      activePanel.scrollIntoView({
        block: 'nearest',
        behavior: getMotionBehavior()
      });
    }
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => activate(button.dataset[buttonKey]));
  });

  return { buttons, panels, activate };
}
