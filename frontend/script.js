document.addEventListener("DOMContentLoaded", function () {
  const cardContainer = document.getElementById("cardContainer");
  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");

  let cards = [];

  // Load cards from JSON
  fetch("backend/data/cards.json")
    .then((response) => response.json())
    .then((data) => {
      cards = data;
      displayCards(cards);
      populateCategories(cards);
    })
    .catch((error) => console.error("Error loading cards:", error));

  // Display cards in grid
  function displayCards(cardsToDisplay) {
    cardContainer.innerHTML = "";
    cardsToDisplay.forEach((card) => {
      const cardElement = document.createElement("div");
      cardElement.classList.add("card");
      cardElement.innerHTML = `
        <div class="card-inner">
          <div class="card-front">
            <h3>${card.title}</h3>
            <p>${card.description}</p>
          </div>
          <div class="card-back">
            <p>${card.details}</p>
          </div>
        </div>`;
      cardElement.addEventListener("click", () => {
        cardElement.classList.toggle("flipped");
      });
      cardContainer.appendChild(cardElement);
    });
  }

  // Filter cards by search input
  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredCards = cards.filter((card) =>
      card.title.toLowerCase().includes(searchTerm)
    );
    displayCards(filteredCards);
  });

  // Populate category select
  function populateCategories(cards) {
    const categories = [...new Set(cards.map((card) => card.category))];
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });

    categorySelect.addEventListener("change", (e) => {
      const selectedCategory = e.target.value;
      const filteredCards = selectedCategory
        ? cards.filter((card) => card.category === selectedCategory)
        : cards;
      displayCards(filteredCards);
    });
  }
});
