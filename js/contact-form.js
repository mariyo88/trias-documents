// Contact form submission handler
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value;
    
    // Here you would typically send this data to your backend
    alert('Hvala što ste nas kontaktirali! Odgovorićemo vam u najkraćem mogućem roku.');
    this.reset();
});
