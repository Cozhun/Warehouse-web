console.log('js/profile.js script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded event fired for profile.js');

    const profileForm = document.getElementById('profileForm');
    const passwordForm = document.getElementById('passwordForm');
    const spinner = document.getElementById('profileSpinner');
    const alertElement = document.getElementById('profileAlert');

    // Функция показа уведомления
    function showAlert(message, type) {
        console.error(`[showAlert ${type}]: ${message}`);
        if (alertElement) {
            alertElement.className = `alert alert-${type}`;
            alertElement.textContent = message;
            alertElement.style.display = 'block';
            setTimeout(() => {
                if (alertElement) alertElement.style.display = 'none';
            }, 5000);
        } else {
             console.error('#profileAlert element not found!');
        }
    }

    // Загрузка данных профиля
    async function loadProfile() {
        console.log('loadProfile function started');
        try {
            console.log('Attempting to fetch /api/profile');
            const response = await fetch('/api/profile');
            console.log('Fetch response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
                console.error('Fetch error data:', errorData);
                throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
            }
            
            const profile = await response.json();
            console.log('Received profile data:', profile);
            
            // Используем lowercase имена полей, возвращаемые PostgreSQL
            document.getElementById('username').value = profile.username || 'N/A';
            document.getElementById('email').value = profile.email || 'N/A';
            document.getElementById('enterpriseName').value = profile.enterpriseName || 'Не указано';
            document.getElementById('enterpriseId').value = profile.enterpriseId !== null && profile.enterpriseId !== undefined ? profile.enterpriseId : 'N/A';
            // Сделаем поля username и enterpriseName неизменяемыми
            document.getElementById('username').readOnly = true;
            document.getElementById('enterpriseName').readOnly = true;
            // ID предприятия тоже сделаем неизменяемым
            document.getElementById('enterpriseId').readOnly = true;

        } catch (err) {
            console.error('[loadProfile catch block] Error loading profile:', err);
            showAlert('Ошибка загрузки профиля: ' + err.message, 'danger');
        }
    }

    // Обработка обновления профиля
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!this.checkValidity()) {
            e.stopPropagation();
            this.classList.add('was-validated');
            return;
        }

        spinner.style.display = 'block';
        
        try {
            const response = await fetch('/api/profile/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: document.getElementById('email').value
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('Профиль успешно обновлен', 'success');
            } else {
                showAlert('Ошибка обновления профиля: ' + data.error, 'danger');
            }
        } catch (err) {
            console.error('Error updating profile:', err);
            showAlert('Ошибка обновления профиля', 'danger');
        } finally {
            spinner.style.display = 'none';
        }
    });

    // Обработка смены пароля
    passwordForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!this.checkValidity()) {
            e.stopPropagation();
            this.classList.add('was-validated');
            return;
        }

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (newPassword !== confirmPassword) {
            showAlert('Пароли не совпадают', 'danger');
            return;
        }

        spinner.style.display = 'block';
        
        try {
            const response = await fetch('/api/profile/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentPassword: document.getElementById('currentPassword').value,
                    newPassword: newPassword
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('Пароль успешно изменен', 'success');
                this.reset();
                this.classList.remove('was-validated');
            } else {
                showAlert('Ошибка смены пароля: ' + data.error, 'danger');
            }
        } catch (err) {
            console.error('Error changing password:', err);
            showAlert('Ошибка смены пароля', 'danger');
        } finally {
            spinner.style.display = 'none';
        }
    });

    // Валидация полей
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', function() {
            if (this.checkValidity()) {
                this.classList.remove('is-invalid');
                this.classList.add('is-valid');
            } else {
                this.classList.remove('is-valid');
                this.classList.add('is-invalid');
            }
        });
    });

    // Загружаем профиль при загрузке страницы
    loadProfile();
});
