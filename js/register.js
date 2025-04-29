document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registerForm');
    const spinner = document.getElementById('registerSpinner');
    const alert = document.getElementById('registerAlert');
    const joinExistingCheckbox = document.getElementById('joinExisting');
    const existingEnterpriseFields = document.getElementById('existingEnterpriseFields');
    const newEnterpriseFields = document.getElementById('newEnterpriseFields');

    // Функция показа уведомления
    function showAlert(message, type) {
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.style.display = 'block';
        setTimeout(() => {
            alert.style.display = 'none';
        }, 3000);
    }

    // Переключение полей предприятия
    joinExistingCheckbox.addEventListener('change', function() {
        if (this.checked) {
            existingEnterpriseFields.style.display = 'block';
            newEnterpriseFields.style.display = 'none';
        } else {
            existingEnterpriseFields.style.display = 'none';
            newEnterpriseFields.style.display = 'block';
        }
    });

    // Валидация полей
    const inputs = form.querySelectorAll('input');
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

    // Обработка отправки формы
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            return;
        }

        spinner.style.display = 'block';
        
        try {
            const joinExisting = joinExistingCheckbox.checked;
            const requestData = {
                username: document.getElementById('username').value,
                password: document.getElementById('password').value,
                email: document.getElementById('email').value,
                joinExisting: joinExisting
            };

            if (joinExisting) {
                requestData.enterpriseId = document.getElementById('enterpriseId').value;
            } else {
                requestData.enterpriseName = document.getElementById('enterpriseName').value;
            }

            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                showAlert('Регистрация успешна! Перенаправление на склад...', 'success');
                setTimeout(() => {
                    window.location.href = 'inventory.html';
                }, 1500);
            } else {
                showAlert(`Ошибка регистрации: ${data.error || 'Неизвестная ошибка'}`, 'danger');
            }
        } catch (err) {
            showAlert('Сетевая ошибка или ошибка обработки запроса', 'danger');
            console.error('Registration error:', err);
        } finally {
            spinner.style.display = 'none';
        }
    });

    // Валидация совпадения паролей
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    
    function validatePassword() {
        if (password.value !== confirmPassword.value) {
            confirmPassword.setCustomValidity('Пароли не совпадают');
        } else {
            confirmPassword.setCustomValidity('');
        }
    }

    password.addEventListener('change', validatePassword);
    confirmPassword.addEventListener('change', validatePassword);
});
