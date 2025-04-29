document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const spinner = document.getElementById('loginSpinner');
    const alert = document.getElementById('loginAlert');

    // Функция показа уведомления
    function showAlert(message, type) {
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.style.display = 'block';
        setTimeout(() => {
            alert.style.display = 'none';
        }, 3000);
    }

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
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('Вход выполнен успешно!', 'success');
                // Перенаправляем на главную страницу после успешного входа
                setTimeout(() => {
                    window.location.href = 'inventory.html';
                }, 1000);
            } else {
                showAlert('Ошибка входа: ' + data.error, 'danger');
            }
        } catch (err) {
            showAlert('Ошибка входа', 'danger');
            console.error('Login error:', err);
        } finally {
            spinner.style.display = 'none';
        }
    });
});
