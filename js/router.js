export function initRouter(onRoute) {
  const tabs = [...document.querySelectorAll("[data-route]")];
  const renderRoute = () => {
    const route = location.hash.replace("#", "") || "roll-call";
    tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.route === route));
    onRoute(route);
  };
  tabs.forEach((tab) => tab.addEventListener("click", () => { location.hash = tab.dataset.route; }));
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}
