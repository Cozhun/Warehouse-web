document.addEventListener('DOMContentLoaded', function() {
    console.log('Records script loaded.');

    // Элементы для отчета "Движение товаров"
    const productMovementReportForm = document.getElementById('productMovementReportForm');
    let pmCategoryIdSelect;
    const pmUserIdSelect = document.getElementById('pmUserId');
    const reportResultArea = document.getElementById('reportResultArea');

    console.log('[DEBUG] productMovementReportForm:', productMovementReportForm); // Отладка
    if (productMovementReportForm) {
        pmCategoryIdSelect = document.getElementById('pmCategoryId');
        console.log('[DEBUG] pmCategoryIdSelect initialized:', pmCategoryIdSelect); // Отладка
    } else {
        console.log('[DEBUG] productMovementReportForm NOT found, pmCategoryIdSelect not initialized.'); // Отладка
    }

    // Элементы для отчета "Состояние склада (Инвентаризация)"
    const inventoryOnHandReportForm = document.getElementById('inventoryOnHandReportForm');
    let iohCategoryIdSelect, iohQuantityFilterTypeSelect, inventoryOnHandReportResultArea;

    if (inventoryOnHandReportForm) {
        iohCategoryIdSelect = document.getElementById('iohCategoryId');
        iohQuantityFilterTypeSelect = document.getElementById('iohQuantityFilterType');
        inventoryOnHandReportResultArea = document.getElementById('inventoryOnHandReportResultArea');
    }
    // const iohSortSelect = document.getElementById('iohSort'); // Если раскомментировать сортировку
    // const iohOrderSelect = document.getElementById('iohOrder'); // Если раскомментировать сортировку

    // Общая переменная для хранения категорий, чтобы не загружать их несколько раз
    let categoriesCache = null;

    // Функция для отображения уведомлений
    function showAlert(message, type = 'danger', containerId = 'reportResultArea') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Alert container not found:', containerId);
            return;
        }
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        if (container.firstChild && container.firstChild.classList && container.firstChild.classList.contains('alert')) {
            container.innerHTML = ''; 
        }
        container.prepend(alertDiv);
    }

    // Загрузка данных для фильтров (товары, пользователи, категории)
    async function loadFilterData() {
        try {
            // Загрузка пользователей
            const usersResponse = await fetch('/api/enterprise/users');
            const usersData = await usersResponse.json();
            if (usersData.success && usersData.users) {
                usersData.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.userId;
                    option.textContent = `${user.firstName || ''} ${user.lastName || ''} (${user.username})`;
                    if (pmUserIdSelect) pmUserIdSelect.appendChild(option.cloneNode(true));
                });
            } else if (usersResponse.status === 403) {
                console.warn('Current user cannot load enterprise users for filter.');
                if (pmUserIdSelect) {
                    pmUserIdSelect.disabled = true;
                    const option = document.createElement('option');
                    option.textContent = 'Список пользователей недоступен';
                    pmUserIdSelect.appendChild(option);
                }
            } else {
                console.warn('Could not load users for filter');
            }

            // Загрузка категорий
            if (!categoriesCache) {
                const categoriesResponse = await fetch('/api/categories');
                if (categoriesResponse.ok) {
                    const loadedCategories = await categoriesResponse.json();
                    if (Array.isArray(loadedCategories)) {
                        categoriesCache = loadedCategories;
                        console.log('Categories loaded successfully:', categoriesCache);
                    } else {
                        console.warn('Could not load categories: API did not return an array.', loadedCategories);
                        categoriesCache = [];
                    }
                } else {
                    console.warn('Could not load categories: API request failed.', categoriesResponse.status, categoriesResponse.statusText);
                    categoriesCache = [];
                }
            }
            
            console.log('[DEBUG] Attempting to populate pmCategoryIdSelect. Element:', pmCategoryIdSelect, 'Cache available:', !!categoriesCache); // Отладка
            // Заполнение селекта категорий для отчета "Движение товаров"
            if (pmCategoryIdSelect && categoriesCache) {
                pmCategoryIdSelect.innerHTML = '<option value="">Все категории</option>'; // Очищаем и добавляем дефолтную
                categoriesCache.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.categoryId;
                    option.textContent = category.name;
                    pmCategoryIdSelect.appendChild(option);
                });
            }

            // Заполнение селекта категорий для отчета "Состояние склада"
            if (iohCategoryIdSelect && categoriesCache) {
                 iohCategoryIdSelect.innerHTML = '<option value="">Все категории</option>'; // Очищаем и добавляем дефолтную
                categoriesCache.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.categoryId;
                    option.textContent = category.name;
                    iohCategoryIdSelect.appendChild(option);
                });
            }

        } catch (error) {
            console.error('Error loading filter data:', error);
            showAlert('Ошибка загрузки данных для фильтров.', 'warning', productMovementReportForm ? 'reportResultArea' : 'inventoryOnHandReportResultArea');
        }
    }

    // Обработка отправки формы отчета "Движение товаров"
    if (productMovementReportForm) {
        productMovementReportForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            reportResultArea.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Загрузка...</span></div> <p>Формирование отчета...</p></div>';
            
            const filters = {
                startDate: document.getElementById('pmStartDate').value,
                endDate: document.getElementById('pmEndDate').value,
                categoryId: pmCategoryIdSelect ? pmCategoryIdSelect.value : '',
                userId: pmUserIdSelect.value,
            };
            
            const movementTypeSelect = document.getElementById('pmMovementType').value;
            let actionTypes = [];
            switch (movementTypeSelect) {
                case 'inbound': actionTypes = ['PRODUCT_ADDED', 'ADJUSTMENT_IN']; break;
                case 'outbound': actionTypes = ['ADJUSTMENT_OUT']; break; // Добавить SALE, WRITE_OFF
                case 'PRODUCT_ADDED': actionTypes = ['PRODUCT_ADDED']; break;
                case 'ADJUSTMENT': actionTypes = ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT']; break;
            }
            if (actionTypes.length > 0) {
                filters.actionTypes = actionTypes.join(',');
            }

            const queryParams = new URLSearchParams();
            for (const key in filters) {
                if (filters[key]) {
                    queryParams.append(key, filters[key]);
                }
            }

            try {
                const response = await fetch(`/api/reports/product-movement?${queryParams.toString()}`);
                const result = await response.json();
                if (!response.ok || !result.success) {
                    showAlert(result.error || 'Не удалось сформировать отчет.', 'danger', 'reportResultArea');
                    return;
                }
                renderProductMovementTable(result.data);
            } catch (error) {
                console.error('Error fetching product movement report:', error);
                showAlert('Сетевая ошибка или ошибка сервера при формировании отчета.', 'danger', 'reportResultArea');
            }
        });
    }

    function renderProductMovementTable(data) {
        if (!data || data.length === 0) {
            reportResultArea.innerHTML = '<div class="alert alert-info">По выбранным критериям данные отсутствуют.</div>';
            return;
        }
        let tableHtml = `
            <h4 class="mt-4">Результаты отчета: Движение товаров</h4>
            <table class="table table-striped table-hover table-sm">
                <thead>
                    <tr>
                        <th>Дата</th><th>Товар</th><th>Категория</th><th>Действие</th>
                        <th>Ответственный</th><th>Кол-во До</th><th>Кол-во После</th><th>Изменение</th>
                    </tr>
                </thead>
                <tbody>`;
        data.forEach(row => {
            // console.log('Processing row for PM report table:', row); // Отладка
            tableHtml += `
                <tr>
                    <td>${new Date(row.logDate).toLocaleString('ru-RU')}</td>
                    <td>${row.productName} (ID: ${row.productId})</td>
                    <td>${row.categoryName || '-'}</td>
                    <td>${translateActionType(row.action)}</td>
                    <td>${row.userFirstName || ''} ${row.userLastName || ''} (${row.reportUserId})</td>
                    <td>${row.oldQuantity}</td>
                    <td>${row.newQuantity}</td>
                    <td class="${row.quantityChange > 0 ? 'text-success' : (row.quantityChange < 0 ? 'text-danger' : '')}">
                        ${row.quantityChange > 0 ? '+' : ''}${row.quantityChange}
                    </td>
                </tr>`;
        });
        tableHtml += '</tbody></table>';
        reportResultArea.innerHTML = tableHtml;
    }
    
    function translateActionType(action) {
        switch(action) {
            case 'PRODUCT_ADDED': return 'Добавление нового товара';
            case 'ADJUSTMENT_IN': return 'Корректировка (Приход)';
            case 'ADJUSTMENT_OUT': return 'Корректировка (Расход)';
            default: return action;
        }
    }

    // Обработка отправки формы отчета "Состояние склада (Инвентаризация)"
    if (inventoryOnHandReportForm) {
        inventoryOnHandReportForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            inventoryOnHandReportResultArea.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Загрузка...</span></div> <p>Формирование отчета...</p></div>';
            
            const options = {
                search: iohSearchInput.value,
                categoryId: iohCategoryIdSelect.value,
                quantityFilterType: iohQuantityFilterTypeSelect.value,
                // sort: iohSortSelect.value, // Если раскомментировать сортировку
                // order: iohOrderSelect.value  // Если раскомментировать сортировку
            };

            const queryParams = new URLSearchParams();
            for (const key in options) {
                if (options[key]) {
                    queryParams.append(key, options[key]);
                }
            }

            try {
                const response = await fetch(`/api/reports/inventory-on-hand?${queryParams.toString()}`);
                const result = await response.json();

                if (!response.ok || !result.success) {
                    showAlert(result.error || 'Не удалось сформировать отчет о состоянии склада.', 'danger', 'inventoryOnHandReportResultArea');
                    return;
                }
                renderInventoryOnHandTable(result.data);
            } catch (error) {
                console.error('Error fetching inventory on hand report:', error);
                showAlert('Сетевая ошибка или ошибка сервера при формировании отчета.', 'danger', 'inventoryOnHandReportResultArea');
            }
        });
    }

    function renderInventoryOnHandTable(data) {
        if (!data || data.length === 0) {
            inventoryOnHandReportResultArea.innerHTML = '<div class="alert alert-info">По выбранным критериям данные отсутствуют.</div>';
            return;
        }
        let tableHtml = `
            <h4 class="mt-4">Результаты отчета: Состояние склада</h4>
            <table class="table table-striped table-hover table-sm">
                <thead>
                    <tr>
                        <th>ID Товара</th>
                        <th>Название товара</th>
                        <th>Категория</th>
                        <th>Количество</th>
                        <th>Цена (за ед.)</th> 
                        <th>Общая стоимость</th>
                    </tr>
                </thead>
                <tbody>`;
        data.forEach(row => {
            // console.log('Processing row for IOH report table:', row); // Отладка
            const totalPrice = (parseFloat(row.quantity) * parseFloat(row.price)).toFixed(2);
            tableHtml += `
                <tr>
                    <td>${row.productId}</td>
                    <td>${row.productName}</td>
                    <td>${row.categoryName || '-'}</td>
                    <td>${row.quantity}</td>
                    <td>${row.price ? parseFloat(row.price).toFixed(2) : '-'}</td>
                    <td>${row.price && row.quantity ? totalPrice : '-'}</td>
                </tr>`;
        });
        tableHtml += '</tbody></table>';
        inventoryOnHandReportResultArea.innerHTML = tableHtml;
    }

    // Первоначальная загрузка данных для фильтров
    loadFilterData();
});
