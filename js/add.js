// Выносим функцию обновления списка категорий в глобальную область,
// чтобы ее можно было вызвать из js/categories.js
async function updateCategoryList() {
    console.log('[updateCategoryList] Updating category list...'); // Добавим лог
    try {
        const categories = await getCategories(); // Используем getCategories из этого же файла
        const categorySelect = document.getElementById('productCategory');
        if (!categorySelect) {
            console.error('[updateCategoryList] #productCategory select not found!');
            return;
        }
        const currentValue = categorySelect.value;
        
        categorySelect.innerHTML = '';
        
        const emptyOption = document.createElement('option');
        emptyOption.value = ''; 
        emptyOption.textContent = 'Выберите категорию';
        emptyOption.disabled = true;
        emptyOption.selected = true;
        categorySelect.appendChild(emptyOption);
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.categoryId;
            option.textContent = category.name;
            categorySelect.appendChild(option);
        });
        
        if (currentValue && categories.some(cat => cat.categoryId == currentValue)) {
            categorySelect.value = currentValue;
        }
        console.log('[updateCategoryList] Category list updated.');
    } catch(error) {
         console.error('[updateCategoryList] Error during update:', error);
         // Можно показать ошибку пользователю
         // showAlert('Не удалось обновить список категорий', 'danger'); 
    }
}

// Функция для получения категорий (остается здесь же, т.к. используется updateCategoryList)
async function getCategories() {
    console.log('[getCategories] Fetching categories...'); // Добавим лог
    try {
        const response = await fetch('/api/categories'); 
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const categories = await response.json(); 
        console.log('[getCategories] Categories fetched:', categories); // Добавим лог
        return categories;
    } catch (error) {
        console.error('Error fetching categories:', error);
        // showAlert('Ошибка при получении категорий: ' + error.message, 'danger');
        return [];
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const form = document.getElementById('addProductForm');
    console.log('[add.js] DOMContentLoaded'); // Добавим лог
    
    // Обновление списка категорий при загрузке страницы
    await updateCategoryList();

    // Обработчик отправки формы
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('[add.js] Add product form submitted'); // Добавим лог
        
        // Собираем данные формы
        const name = document.getElementById('productName').value;
        const categoryId = document.getElementById('productCategory').value; // Получаем categoryId
        const description = document.getElementById('productDescription').value;
        const quantity = parseInt(document.getElementById('productQuantity').value);
        const price = parseFloat(document.getElementById('productPrice').value);

        // --- Детальное логирование селекта --- 
        const categorySelectElement = document.getElementById('productCategory');
        const selectedIndex = categorySelectElement.selectedIndex;
        const selectedOption = selectedIndex > -1 ? categorySelectElement.options[selectedIndex] : null;
        
        console.log('[add.js Submit] --- Category Select Debug --- ');
        console.log('    Element:', categorySelectElement);
        console.log('    Selected Index:', selectedIndex);
        console.log('    Selected Option Element:', selectedOption);
        console.log('    Selected Option Value Attribute:', selectedOption ? selectedOption.getAttribute('value') : 'N/A');
        console.log('    Selected Option Text:', selectedOption ? selectedOption.text : 'N/A');
        console.log('    categorySelectElement.value:', categoryId, '(type:', typeof categoryId, ')'); 
        console.log('[add.js Submit] --- End Debug --- ');
        // --- Конец детального логирования --- 

        // Валидация данных
        if (!name || !categoryId || categoryId === '' || isNaN(quantity) || quantity < 0 || isNaN(price) || price < 0) {
            showAlert('Пожалуйста, заполните все поля корректно (Название, Категория, Количество >= 0, Цена >= 0)', 'warning');
            console.warn('[add.js Validation] Failed:', { name, categoryId, quantity, price });
            return;
        }
        console.log('[add.js Validation] Passed.');
        
        // Формируем объект для отправки
        const productData = {
            name,
            categoryId, // Отправляем categoryId
            description, // Поле description пока остается, хотя не используется в db.js
            quantity,
            price
            // enterpriseId не нужен, берется из сессии на сервере
        };

        // Добавление продукта
        const success = await addProduct(productData);
        if (success) {
            // Очистка формы
            this.reset();
            // Обновление списка категорий (не обязательно, но оставим)
            // await updateCategoryList(); 
        }
    });

    // Функция для добавления продукта
    async function addProduct(productData) {
        try {
            const response = await fetch('/api/products', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(productData)
            });

            // Сначала проверяем статус ответа
            if (response.ok) {
                // Если статус 2xx (успех)
                const data = await response.json();
                console.log('Server success response:', data);
                showAlert(data.message || 'Продукт успешно добавлен!', 'success');
                return true; // Возвращаем успех
            } else {
                // Если статус НЕ 2xx (ошибка)
                console.warn('Server error response status:', response.status);
                let errorData = {};
                try {
                    // Пытаемся прочитать тело ответа как JSON, чтобы получить сообщение об ошибке
                    errorData = await response.json(); 
                    console.log('Server error response body:', errorData);
                } catch (e) {
                    // Если тело ответа не JSON или пустое
                    console.error('Could not parse error response body as JSON', e);
                }
                // Выбрасываем ошибку с сообщением от сервера или стандартным текстом
                throw new Error(errorData.error || `Ошибка сервера: ${response.status} ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error adding product:', error);
            showAlert('Ошибка при добавлении продукта: ' + error.message, 'danger');
            return false;
        }
    }

    // Функция показа уведомления
    function showAlert(message, type) {
        // Удаляем предыдущие уведомления
        const existingAlerts = document.querySelectorAll('.alert-floating');
        existingAlerts.forEach(alert => alert.remove());

        const alertDiv = document.createElement('div');
        // Используем стандартные классы Bootstrap alert
        alertDiv.className = `alert alert-${type} alert-dismissible fade show alert-floating`; 
        alertDiv.setAttribute('role', 'alert');
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        // Добавляем уведомление в контейнер (если он есть) или в body
        const container = document.querySelector('.main-content .container') || document.body;
        container.insertBefore(alertDiv, container.firstChild);

        // Автоматически скрываем уведомление через 5 секунд
        setTimeout(() => {
             // Используем Bootstrap для плавного закрытия
            const bsAlert = bootstrap.Alert.getOrCreateInstance(alertDiv);
            if (bsAlert) {
                bsAlert.close();
            }
        }, 5000);
    }
});
