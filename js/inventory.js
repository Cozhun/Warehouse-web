// Глобальные переменные
let currentPage = 1;
let itemsPerPage = 10;
let sortField = 'id';
let sortOrder = 'ASC';
let currentQuantityFilter = 'all';
let products = [];

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    loadDashboardStats();
    loadCategories();
    initializeEventListeners();
});

// Инициализация обработчиков событий
function initializeEventListeners() {
    // Обработчики фильтров
    document.getElementById('searchInput').addEventListener('input', debounce(loadProducts, 300));
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        const selectedCategoryId = e.target.value;
        console.log(`[Inventory Filter Change] Category selected: ${selectedCategoryId}`);
        loadProducts();
    });
    document.getElementById('itemsPerPage').addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        loadProducts();
    });

    // Обработчики кликов по карточкам дашборда
    document.querySelectorAll('.filter-card').forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.dataset.filterType;
            applyQuantityFilter(filterType);
        });
    });

    // Обработчики сортировки
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            if (sortField === field) {
                sortOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
            } else {
                sortField = field;
                sortOrder = 'ASC';
            }
            loadProducts();
        });
    });
}

// Новая функция применения фильтра по количеству
function applyQuantityFilter(filterType) {
    console.log(`[Inventory Filter Click] Applying quantity filter: ${filterType}`);
    // Сбрасываем другие фильтры
    document.getElementById('searchInput').value = '';
    document.getElementById('categoryFilter').value = '';
    // Устанавливаем текущий фильтр
    currentQuantityFilter = filterType;
    // Сбрасываем на первую страницу
    currentPage = 1;
    // Обновляем список товаров
    loadProducts();
    // Обновляем активный класс
    updateActiveFilterCard(filterType);
}

// Новая функция обновления активной карточки
function updateActiveFilterCard(activeFilterType) {
    document.querySelectorAll('.filter-card').forEach(card => {
        if (card.dataset.filterType === activeFilterType) {
            card.classList.add('active-filter'); // Добавить CSS класс для выделения
        } else {
            card.classList.remove('active-filter');
        }
    });
}

// Загрузка товаров с сервера
async function loadProducts() {
    const searchQuery = document.getElementById('searchInput').value;
    const categoryId = document.getElementById('categoryFilter').value;
    console.log(`[Inventory loadProducts] Loading with quantityFilter: ${currentQuantityFilter}, categoryId: ${categoryId}, search: ${searchQuery}`);

    try {
        const apiUrl = `/api/products?page=${currentPage}&limit=${itemsPerPage}&sort=${sortField}&order=${sortOrder}&search=${searchQuery}&category=${categoryId}&quantityFilterType=${currentQuantityFilter}`;
        console.log(`[Inventory loadProducts] Fetching URL: ${apiUrl}`);
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (response.ok && data.products) {
            products = data.products;
            renderProducts(products);
            renderPagination(data.total, data.totalPages);
        } else {
            const errorMsg = data.error || 'Ошибка при загрузке товаров';
            showError(errorMsg);
            console.error('Error loading products:', data.error || 'Unknown error');
            document.getElementById('productsTableBody').innerHTML = '';
            renderPagination(0, 1); 
            products = [];
        }
    } catch (error) {
        showError('Сетевая ошибка или ошибка обработки данных');
        console.error('Network or processing error:', error);
        document.getElementById('productsTableBody').innerHTML = '';
        renderPagination(0, 1); 
        products = [];
    }
}

// Функция отрисовки пагинации
function renderPagination(totalItems, totalPages) {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;

    paginationElement.innerHTML = ''; // Очищаем старую пагинацию

    if (totalPages <= 1) return; // Не показываем пагинацию, если страница одна

    // Кнопка "Назад"
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${prevDisabled}`;
    prevLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage - 1}">Назад</a>`;
    if (currentPage > 1) {
        prevLi.querySelector('a').addEventListener('click', handlePaginationClick);
    }
    paginationElement.appendChild(prevLi);

    // Кнопки страниц (можно добавить логику для "...")
    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? 'active' : '';
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${active}`;
        pageLi.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
        pageLi.querySelector('a').addEventListener('click', handlePaginationClick);
        paginationElement.appendChild(pageLi);
    }

    // Кнопка "Вперед"
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${nextDisabled}`;
    nextLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage + 1}">Вперед</a>`;
    if (currentPage < totalPages) {
        nextLi.querySelector('a').addEventListener('click', handlePaginationClick);
    }
    paginationElement.appendChild(nextLi);
}

// Обработчик клика по пагинации
function handlePaginationClick(e) {
    e.preventDefault();
    const targetPage = parseInt(e.target.dataset.page);
    if (targetPage && targetPage !== currentPage) {
        currentPage = targetPage;
        loadProducts(); 
    }
}

// Отрисовка товаров в таблице
function renderProducts(products) {
    const tbody = document.getElementById('productsTableBody');
    const template = document.getElementById('productRowTemplate').innerHTML;
    
    tbody.innerHTML = products.map(product => {
        const quantityClass = getQuantityClass(product.quantity);
        return template
            .replace(/{productId}/g, product.productId)
            .replace('{name}', product.name)
            .replace('{categoryName}', product.categoryName || 'Без категории')
            .replace(/{quantity}/g, product.quantity)
            .replace('{quantityClass}', quantityClass)
            .replace('{price}', formatPrice(product.price))
            .replace('{createdDate}', formatDate(product.createdDate));
    }).join('');
}

// Определение класса для бейджа количества
function getQuantityClass(quantity) {
    if (quantity <= 0) return 'bg-danger';
    if (quantity <= 10) return 'bg-warning';
    return 'bg-success';
}

// Новая функция загрузки статистики для дашборда
async function loadDashboardStats() {
    console.log('[Inventory] Loading dashboard stats...');
    try {
        const response = await fetch('/api/dashboard-stats');
        if (response.ok) {
            const stats = await response.json();
            console.log('[Inventory] Dashboard stats received:', stats);
            updateDashboard(stats); // Обновляем дашборд с полученными данными
        } else {
            console.error('Failed to load dashboard stats:', response.status);
            showError('Не удалось загрузить статистику дашборда');
            // Можно обнулить дашборд при ошибке
            updateDashboard({ totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0 }); 
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showError('Ошибка сети при загрузке статистики дашборда');
        updateDashboard({ totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0 });
    }
}

// Обновление информационной панели - ТЕПЕРЬ ПРИНИМАЕТ ГОТОВУЮ СТАТИСТИКУ
function updateDashboard(stats) {
    console.log('[Inventory updateDashboard] Updating with stats:', stats);
    // Просто отображаем полученные значения, не считаем их здесь
    document.getElementById('totalProducts').textContent = stats.totalProducts || 0;
    document.getElementById('inStock').textContent = stats.inStock || 0;
    document.getElementById('lowStock').textContent = stats.lowStock || 0;
    document.getElementById('outOfStock').textContent = stats.outOfStock || 0;
    // Можно вернуть отображение категорий, если нужно
    // document.getElementById('totalCategories').textContent = stats.totalCategories || 0;
}

// Функции для работы с товарами
function editQuantity(productId) {
    const product = products.find(p => p.productId === productId);
    if (!product) return;

    document.getElementById('currentQuantity').value = product.quantity;
    document.getElementById('newQuantity').value = product.quantity;
    document.getElementById('newQuantity').min = 0;
    
    const modal = new bootstrap.Modal(document.getElementById('editQuantityModal'));
    modal.show();

    // Сохраняем ID товара для использования при сохранении
    document.getElementById('editQuantityModal').dataset.productId = productId;
}

async function saveQuantityChange() {
    const modal = document.getElementById('editQuantityModal');
    const productId = modal.dataset.productId;
    const newQuantity = document.getElementById('newQuantity').value;

    try {
        const response = await fetch(`/api/products/${productId}/quantity`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                quantity: parseInt(newQuantity)
            })
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
            bootstrap.Modal.getInstance(modal).hide();
            showSuccess('Количество успешно обновлено');
            loadProducts();
        } else {
            showError(data.error || 'Ошибка при обновлении количества');
        }
    } catch (error) {
        showError('Сетевая ошибка при обновлении количества');
        console.error('Error updating quantity:', error);
    }
}

// Вспомогательные функции
function formatPrice(price) {
    return price.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('ru-RU');
}

function showSuccess(message) {
    showAlert(message, 'success');
}

function showError(message) {
    showAlert(message, 'danger');
}

// Обновленная функция для показа уведомлений в inventory.html
function showAlert(message, type) {
    const container = document.getElementById('inventoryAlertContainer');
    if (!container) {
        console.error('Alert container not found!');
        // Fallback to simple alert
        alert(`${type === 'success' ? 'Успех' : 'Ошибка'}: ${message}`);
        return;
    }

    // Удаляем предыдущие уведомления в этом контейнере
    container.innerHTML = ''; 

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`; 
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    container.appendChild(alertDiv);

    // Автоматически скрываем уведомление через 5 секунд
    setTimeout(() => {
         // Используем Bootstrap для плавного закрытия
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alertDiv);
        if (bsAlert) {
            bsAlert.close();
        }
    }, 5000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Загрузка категорий для фильтра
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        if (response.ok) {
            const categories = await response.json();
            const categoryFilter = document.getElementById('categoryFilter');
            // Очищаем старые опции (кроме "Все категории")
            categoryFilter.innerHTML = '<option value="">Все категории</option>'; 
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.categoryId; // Используем ID категории как значение
                option.textContent = category.name; // Отображаем имя категории
                categoryFilter.appendChild(option);
            });
        } else {
            console.error('Failed to load categories:', response.status);
            showError('Не удалось загрузить список категорий');
        }
    } catch (error) {
        console.error('Error loading categories:', error);
        showError('Ошибка сети при загрузке категорий');
    }
}
