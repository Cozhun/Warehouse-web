document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('registerForm');
    const spinner = document.getElementById('registerSpinner');
    const alertElement = document.getElementById('registerAlert');
    
    // Радио-кнопки и группы полей
    const regTypeNewEnterpriseRadio = document.getElementById('regTypeNewEnterprise');
    const regTypeJoinByTokenRadio = document.getElementById('regTypeJoinByToken');
    const newEnterpriseFieldsDiv = document.getElementById('newEnterpriseFields');
    const joinByTokenFieldsDiv = document.getElementById('joinByTokenFields');

    // Поля ввода
    const usernameInput = document.getElementById('username');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const enterpriseNameInput = document.getElementById('enterpriseName');
    const enterpriseIdTokenInput = document.getElementById('enterpriseIdToken');
    const invitationTokenInput = document.getElementById('invitationToken');

    function showAlert(message, type) {
        alertElement.className = `alert alert-${type}`;
        alertElement.textContent = message;
        alertElement.style.display = 'block';
        setTimeout(() => {
            alertElement.style.display = 'none';
        }, 5000);
    }

    function toggleEnterpriseFields() {
        if (regTypeNewEnterpriseRadio.checked) {
            newEnterpriseFieldsDiv.style.display = 'block';
            joinByTokenFieldsDiv.style.display = 'none';
            enterpriseNameInput.required = true;
            enterpriseIdTokenInput.required = false;
            invitationTokenInput.required = false;
        } else if (regTypeJoinByTokenRadio.checked) {
            newEnterpriseFieldsDiv.style.display = 'none';
            joinByTokenFieldsDiv.style.display = 'block';
            enterpriseNameInput.required = false;
            enterpriseIdTokenInput.required = true;
            invitationTokenInput.required = true;
        }
    }

    regTypeNewEnterpriseRadio.addEventListener('change', toggleEnterpriseFields);
    regTypeJoinByTokenRadio.addEventListener('change', toggleEnterpriseFields);
    toggleEnterpriseFields();

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
            // Если это поле пароля или подтверждения пароля, проверяем совпадение
            if (this === passwordInput || this === confirmPasswordInput) {
                validatePasswordMatch();
            }
        });
    });

    // Обработка отправки формы
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Проверяем совпадение паролей перед отправкой
        validatePasswordMatch();
        
        if (regTypeNewEnterpriseRadio.checked) {
            if (!enterpriseNameInput.value) enterpriseNameInput.classList.add('is-invalid');
        } else if (regTypeJoinByTokenRadio.checked) {
            if (!enterpriseIdTokenInput.value) enterpriseIdTokenInput.classList.add('is-invalid');
            if (!invitationTokenInput.value) invitationTokenInput.classList.add('is-invalid');
        }

        if (!form.checkValidity()) {
            e.stopPropagation();
            form.classList.add('was-validated');
            const firstInvalid = form.querySelector(':invalid');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        spinner.style.display = 'block';
        
        try {
            const requestData = {
                username: usernameInput.value,
                firstName: firstNameInput.value,
                lastName: lastNameInput.value,
                password: passwordInput.value,
                email: emailInput.value,
            };

            if (regTypeNewEnterpriseRadio.checked) {
                requestData.enterpriseName = enterpriseNameInput.value;
                requestData.joinExisting = false;
            } else if (regTypeJoinByTokenRadio.checked) {
                requestData.enterpriseId = enterpriseIdTokenInput.value;
                requestData.invitationToken = invitationTokenInput.value;
                requestData.joinExisting = true;
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
    function validatePasswordMatch() {
        if (passwordInput.value !== confirmPasswordInput.value) {
            confirmPasswordInput.setCustomValidity('Пароли не совпадают');
            confirmPasswordInput.classList.remove('is-valid');
            confirmPasswordInput.classList.add('is-invalid');
        } else {
            confirmPasswordInput.setCustomValidity('');
            if (confirmPasswordInput.value) {
                confirmPasswordInput.classList.remove('is-invalid');
                confirmPasswordInput.classList.add('is-valid');
            }
        }
    }

    // Вызываем валидацию при загрузке страницы
    validatePasswordMatch();

    // Добавляем обработчики событий для полей паролей
    passwordInput.addEventListener('input', validatePasswordMatch);
    confirmPasswordInput.addEventListener('input', validatePasswordMatch);
});
