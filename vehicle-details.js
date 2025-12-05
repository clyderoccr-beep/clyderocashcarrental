// ===== VEHICLE DETAILS PAGE (TURO STYLE) =====

// Global variable to store current vehicle details
let currentVehicleDetails = null;

// Show vehicle details page
window.showVehicleDetails = function(vehicleId) {
  // Find vehicle in all sources
  let vehicle = VEHICLES.find(v => v.id === vehicleId);
  
  // If not found in admin vehicles, search host vehicles
  if(!vehicle) {
    try {
      const allHosts = JSON.parse(localStorage.getItem(ALL_HOSTS_KEY) || '[]');
      for(const host of allHosts) {
        const vehicles = JSON.parse(localStorage.getItem(HOST_VEHICLES_KEY + host.email) || '[]');
        vehicle = vehicles.find(v => v.id === vehicleId);
        if(vehicle) break;
      }
    } catch(e) {
      console.warn('Failed to load host vehicles:', e);
    }
  }
  
  if(!vehicle) {
    showToast('Vehicle not found');
    return;
  }
  
  currentVehicleDetails = vehicle;
  populateVehicleDetails(vehicle);
  goto('vehicle-details');
};

// Populate vehicle details page with data
function populateVehicleDetails(vehicle) {
  // Hero image
  const photos = vehicle.photos || vehicle.imgs || [];
  const heroImg = document.getElementById('vehicleDetailHeroImg');
  if(heroImg && photos.length > 0) {
    heroImg.src = photos[0];
    heroImg.alt = vehicle.makeModel || vehicle.name || 'Vehicle';
  }
  
  // Thumbnail gallery
  const thumbnails = document.getElementById('vehicleDetailThumbnails');
  if(thumbnails) {
    thumbnails.innerHTML = photos.map((photo, index) => `
      <div onclick="updateVehicleDetailHeroImage('${photo}')" style="width:100px;height:80px;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid ${index === 0 ? '#121214' : '#e0e0e0'};flex-shrink:0">
        <img src="${photo}" alt="Thumbnail ${index + 1}" style="width:100%;height:100%;object-fit:cover">
      </div>
    `).join('');
  }
  
  // Title
  const title = document.getElementById('vehicleDetailTitle');
  if(title) {
    const displayName = vehicle.year 
      ? `${vehicle.make || ''} ${vehicle.model || vehicle.makeModel || ''} ${vehicle.year}`.trim()
      : vehicle.makeModel || vehicle.name || 'Vehicle';
    title.textContent = displayName;
  }
  
  // Rating and trips (placeholder data)
  const rating = document.getElementById('vehicleDetailRating');
  if(rating) rating.textContent = vehicle.rating || '5.0';
  
  const trips = document.getElementById('vehicleDetailTrips');
  if(trips) trips.textContent = `${vehicle.tripCount || 0} trips`;
  
  // Quick features
  const seats = document.getElementById('vehicleDetailSeats');
  if(seats) seats.textContent = `${vehicle.seats || 5} seats`;
  
  const transmission = document.getElementById('vehicleDetailTransmission');
  if(transmission) transmission.textContent = vehicle.transmission || 'Automatic';
  
  const gas = document.getElementById('vehicleDetailGas');
  if(gas) gas.textContent = vehicle.gasType || 'Regular';
  
  const mpg = document.getElementById('vehicleDetailMPG');
  if(mpg) mpg.textContent = `${vehicle.mpg || 25} MPG`;
  
  // Host information
  const hostName = document.getElementById('vehicleDetailHostName');
  const hostRating = document.getElementById('vehicleDetailHostRating');
  const hostTrips = document.getElementById('vehicleDetailHostTrips');
  const hostAvatar = document.getElementById('vehicleDetailHostAvatar');
  
  if(vehicle.hostId) {
    try {
      const hostProfile = JSON.parse(localStorage.getItem(HOST_PROFILE_KEY + vehicle.hostId) || '{}');
      if(hostName) hostName.textContent = hostProfile.name || vehicle.hostId.split('@')[0];
      if(hostRating) hostRating.textContent = (hostProfile.rating || 5.0).toFixed(1);
      if(hostTrips) hostTrips.textContent = hostProfile.tripCount || 0;
      
      if(hostAvatar && hostProfile.avatarUrl) {
        hostAvatar.innerHTML = `<img src="${hostProfile.avatarUrl}" alt="Host" style="width:100%;height:100%;object-fit:cover">`;
      }
    } catch(e) {
      console.warn('Failed to load host profile:', e);
    }
  } else {
    if(hostName) hostName.textContent = 'Clydero Cash Car Rental';
    if(hostRating) hostRating.textContent = '5.0';
    if(hostTrips) hostTrips.textContent = '100+';
  }
  
  // Description
  const description = document.getElementById('vehicleDetailDescription');
  if(description) {
    description.textContent = vehicle.description || 'No description available.';
  }
  
  // Insurance section
  const insuranceSection = document.getElementById('vehicleDetailInsuranceSection');
  if(insuranceSection) {
    if(vehicle.insuranceIncluded) {
      insuranceSection.innerHTML = `
        <div style="background:#e8f5e9;border:1px solid #4caf50;padding:20px;border-radius:12px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <span style="font-size:32px">✓</span>
            <div>
              <div style="font-size:18px;font-weight:700;color:#2e7d32">Insurance Included</div>
              <div style="font-size:14px;color:#666;margin-top:4px">${vehicle.insuranceType || 'Coverage included'}</div>
            </div>
          </div>
          ${vehicle.insuranceNotes ? `<div style="font-size:13px;color:#666;margin-top:12px;padding-top:12px;border-top:1px solid #c8e6c9">${vehicle.insuranceNotes}</div>` : ''}
        </div>
      `;
    } else {
      insuranceSection.innerHTML = `
        <div style="background:#ffebee;border:1px solid #f44336;padding:20px;border-radius:12px">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:32px">⚠️</span>
            <div>
              <div style="font-size:18px;font-weight:700;color:#c62828">No Insurance Included</div>
              <div style="font-size:14px;color:#666;margin-top:4px">You'll need to provide your own insurance coverage</div>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  // Price
  const price = document.getElementById('vehicleDetailPrice');
  if(price) price.textContent = vehicle.price || 0;
  
  const priceTerm = document.getElementById('vehicleDetailPriceTerm');
  if(priceTerm) {
    const term = vehicle.rentalTerm === 'Weekly' ? 'week' : vehicle.rentalTerm === 'Daily' ? 'day' : 'week';
    priceTerm.textContent = `Rental price per ${term}`;
  }
  
  // Location
  const address = document.getElementById('vehicleDetailAddress');
  if(address) {
    address.textContent = `${vehicle.address || ''}, ${vehicle.city}, ${vehicle.state} ${vehicle.zip || ''}`.trim();
  }
  
  const pickupLocation = document.getElementById('vehicleDetailPickupLocation');
  if(pickupLocation) {
    pickupLocation.textContent = `${vehicle.city}, ${vehicle.state}`;
  }
  
  // Initialize date inputs with current date
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const pickupDate = document.getElementById('detailPickupDate');
  const returnDate = document.getElementById('detailReturnDate');
  
  if(pickupDate) {
    pickupDate.value = formatDateTimeLocal(tomorrow);
  }
  
  if(returnDate) {
    const weekLater = new Date(tomorrow.getTime() + 7 * 24 * 60 * 60 * 1000);
    returnDate.value = formatDateTimeLocal(weekLater);
  }
  
  updateVehicleDetailPricing();
}

// Update hero image when thumbnail clicked
window.updateVehicleDetailHeroImage = function(imageSrc) {
  const heroImg = document.getElementById('vehicleDetailHeroImg');
  if(heroImg) {
    heroImg.src = imageSrc;
  }
  
  // Update thumbnail borders
  const thumbnails = document.querySelectorAll('#vehicleDetailThumbnails > div');
  thumbnails.forEach(thumb => {
    const img = thumb.querySelector('img');
    if(img && img.src === imageSrc) {
      thumb.style.border = '2px solid #121214';
    } else {
      thumb.style.border = '2px solid #e0e0e0';
    }
  });
};

// Format date for datetime-local input
function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Update pricing based on selected dates
function updateVehicleDetailPricing() {
  if(!currentVehicleDetails) return;
  
  const pickupDate = document.getElementById('detailPickupDate');
  const returnDate = document.getElementById('detailReturnDate');
  
  if(!pickupDate || !returnDate || !pickupDate.value || !returnDate.value) return;
  
  const pickup = new Date(pickupDate.value);
  const returnD = new Date(returnDate.value);
  const days = Math.ceil((returnD - pickup) / (1000 * 60 * 60 * 24));
  
  if(days <= 0) {
    document.getElementById('vehicleDetailTripPrice').textContent = '$0.00';
    document.getElementById('vehicleDetailTotal').textContent = '$0.00';
    return;
  }
  
  let price = currentVehicleDetails.price || 0;
  let total = 0;
  
  if(currentVehicleDetails.rentalTerm === 'Weekly') {
    const weeks = Math.ceil(days / 7);
    total = price * weeks;
  } else if(currentVehicleDetails.rentalTerm === 'Daily') {
    total = price * days;
  } else {
    // Default to weekly
    const weeks = Math.ceil(days / 7);
    total = price * weeks;
  }
  
  document.getElementById('vehicleDetailTripPrice').textContent = `$${total.toFixed(2)}`;
  document.getElementById('vehicleDetailTotal').textContent = `$${total.toFixed(2)}`;
}

// Handle tab switching
document.addEventListener('click', (e) => {
  if(e.target.classList.contains('vehicle-tab')) {
    const tabName = e.target.dataset.tab;
    
    // Update tab buttons
    document.querySelectorAll('.vehicle-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.style.color = '#666';
      tab.style.borderBottom = '3px solid transparent';
    });
    
    e.target.classList.add('active');
    e.target.style.color = '#121214';
    e.target.style.borderBottom = '3px solid #121214';
    
    // Update tab content
    document.querySelectorAll('.vehicle-tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    const targetContent = document.getElementById(`tab-${tabName}`);
    if(targetContent) {
      targetContent.style.display = 'block';
    }
  }
});

// Handle date changes
document.addEventListener('change', (e) => {
  if(e.target.id === 'detailPickupDate' || e.target.id === 'detailReturnDate') {
    updateVehicleDetailPricing();
  }
});

// Handle Continue button - redirect to booking
document.addEventListener('click', (e) => {
  if(e.target.id === 'vehicleDetailBookBtn') {
    if(!currentVehicleDetails) {
      showToast('Vehicle information not available');
      return;
    }
    
    // Store booking data and navigate to booking page
    sessionStorage.setItem('selectedVehicle', JSON.stringify(currentVehicleDetails));
    sessionStorage.setItem('pickupDate', document.getElementById('detailPickupDate').value);
    sessionStorage.setItem('returnDate', document.getElementById('detailReturnDate').value);
    
    goto('booking');
    
    // Pre-populate booking form
    setTimeout(() => {
      const vehicleSelect = document.getElementById('vehicle-select');
      if(vehicleSelect) {
        // Find and select this vehicle in the dropdown
        for(let i = 0; i < vehicleSelect.options.length; i++) {
          if(vehicleSelect.options[i].value === currentVehicleDetails.id) {
            vehicleSelect.selectedIndex = i;
            break;
          }
        }
      }
      
      // Set pickup date
      const pickupDateInput = document.getElementById('pickupDate');
      const pickup = document.getElementById('detailPickupDate').value;
      if(pickupDateInput && pickup) {
        pickupDateInput.value = pickup.split('T')[0]; // Extract date part
      }
    }, 100);
  }
});

// Update vehicle grid to show details on click
document.addEventListener('click', (e) => {
  // Check if clicked on vehicle card image or if inside vehicle card
  const vehicleCard = e.target.closest('[data-vehicle-id]');
  if(vehicleCard && !e.target.closest('button') && !e.target.hasAttribute('data-nav')) {
    const vehicleId = vehicleCard.getAttribute('data-vehicle-id');
    if(vehicleId) {
      showVehicleDetails(vehicleId);
    }
  }
});
