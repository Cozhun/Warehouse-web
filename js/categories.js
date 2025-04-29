// Функция добавления новой категории
async function addNewCategory(name, description) {
    console.log('[addNewCategory] Called with name:', name);
    // Убираем проверку токена, полагаемся на сессию
    // const token = localStorage.getItem('token');
    // if (!token) { ... }

    try {
        console.log('[addNewCategory] Attempting to POST /api/categories');
        // Используем правильный API эндпоинт
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // Убираем Authorization заголовок
            },
            body: JSON.stringify({ 
                name: name, 
                // Поле description не предусмотрено в таблице Categories, 
                // но можем передать, если добавим его позже на бэкенде.
                // Пока передавать не будем.
                // description: description 
            })
        });
        console.log('[addNewCategory] Fetch response status:', response.status);

        const data = await response.json();
        console.log('[addNewCategory] Fetch response data:', data);
        
        if (response.ok && data.success) {
            console.log('[addNewCategory] Category added successfully. Attempting to update list.');
            if (typeof updateCategoryList === 'function') {
                await updateCategoryList(); // Просто обновляем список
                console.log('[addNewCategory] Category list updated.');
            } else {
                console.warn('[addNewCategory] updateCategoryList function is not accessible.');
            }
            return true;
        } else {
            console.error('[addNewCategory] Server returned error or success:false');
            throw new Error(data.error || 'Ошибка от сервера при добавлении категории');
        }
    } catch (error) {
        console.error('[addNewCategory catch block] Error adding category:', error);
        // Передаем ошибку дальше, чтобы ее обработал вызывающий код
        throw error; 
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('[categories.js] DOMContentLoaded');
    // Функция loadCategories здесь не нужна, она дублирует логику из add.js
    // loadCategories(); 

    const categoryForm = document.getElementById('newCategoryForm');
    const saveButton = document.getElementById('saveCategory');
    const spinner = document.getElementById('categorySpinner');
    const newCategoryModalElement = document.getElementById('newCategoryModal');
    
    if (!categoryForm || !saveButton || !spinner || !newCategoryModalElement) {
        console.error('[categories.js] Critical elements for new category modal not found!');
        return; // Прерываем выполнение, если элементы не найдены
    }
    
    const modal = bootstrap.Modal.getOrCreateInstance(newCategoryModalElement);
    console.log('[categories.js] Modal instance created');

    // Используем submit событие формы, а не click кнопки
    categoryForm.addEventListener('submit', async function(e) {
        e.preventDefault(); // Предотвращаем стандартную отправку
        console.log('[categories.js] New category form submitted');
        
        const nameInput = document.getElementById('categoryName');
        const descInput = document.getElementById('categoryDescription'); // Описание пока не используется

        if (!nameInput.value.trim()) {
            console.log('[categories.js] Category name is empty');
            nameInput.classList.add('is-invalid');
            return;
        }
        nameInput.classList.remove('is-invalid'); // Убираем класс ошибки, если поле заполнено
        console.log('[categories.js] Validation passed. Category name:', nameInput.value.trim());

        spinner.classList.remove('d-none');
        saveButton.disabled = true;
        console.log('[categories.js] Spinner shown, button disabled');

        try {
            console.log('[categories.js] Calling addNewCategory...');
            await addNewCategory(
                nameInput.value.trim(),
                descInput.value.trim() // Передаем описание, но оно не будет использовано на бэке
            );
            console.log('[categories.js] addNewCategory call finished successfully');
            
            // Очищаем форму
            categoryForm.reset();
            
            // Закрываем модальное окно
            modal.hide();
            console.log('[categories.js] Form reset, modal hidden');
            
            // Показываем уведомление об успехе (используем showAlert из add.js)
            if (typeof showAlert === 'function') {
                 showAlert('Категория успешно добавлена', 'success');
            } else {
                 console.error('[categories.js] showAlert function not found from add.js');
                 alert('Категория успешно добавлена'); // Fallback
            }
           
        } catch (error) {
             console.error('[categories.js submit catch block] Error:', error);
             if (typeof showAlert === 'function') {
                 showAlert(error.message || 'Ошибка при добавлении категории', 'danger');
             } else {
                 console.error('[categories.js] showAlert function not found from add.js');
                 alert(error.message || 'Ошибка при добавлении категории'); // Fallback
             }
        } finally {
            spinner.classList.add('d-none');
            saveButton.disabled = false;
            console.log('[categories.js] Finally block: Spinner hidden, button enabled');
        }
    });

    // Очистка валидации при вводе
    document.getElementById('categoryName').addEventListener('input', function() {
        this.classList.remove('is-invalid');
    });
    
    // Очистка формы при закрытии модального окна
    newCategoryModalElement.addEventListener('hidden.bs.modal', function () {
        categoryForm.reset();
        document.getElementById('categoryName').classList.remove('is-invalid');
    });
});

// Функция showAlert здесь не нужна, будет использоваться из add.js
// function showAlert(message, type) { ... } 