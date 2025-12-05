// ===== VEHICLE DETAILS PAGE (FULL TURO STYLE) =====

// Global variables
let currentVehicleDetails = null;
let currentLightboxIndex = 0;
let lightboxImages = [];
let descriptionExpanded = false;

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
  window.scrollTo(0, 0);
};

// Populate all vehicle details
function populateVehicleDetails(vehicle) {
  const photos = vehicle.photos || vehicle.imgs || [];
  lightboxImages = photos;
  
  // Hero image
  const heroImg = document.getElementById('vehicleDetailHeroImg');
  if(heroImg && photos.length > 0) {
    heroImg.src = photos[0];
    heroImg.alt = vehicle.makeModel || vehicle.name || 'Vehicle';
  }
  
  // Photo count
  const photoCount = document.getElementById('vehiclePhotoCount');
  if(photoCount) photoCount.textContent = photos.length;
  
  // Thumbnail gallery (show first 3 images on right side)
  const thumbnails = document.getElementById('vehicleDetailThumbnails');
  if(thumbnails) {
    const thumbsToShow = photos.slice(0, 3);
    thumbnails.innerHTML = thumbsToShow.map((photo, index) => `
      <div onclick="updateVehicleDetailHeroImage('${photo}', ${index})" style="width:100%;height:${index === 0 ? '180px' : '120px'};border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid ${index === 0 ? '#121214' : 'transparent'};flex-shrink:0">
        <img src="${photo}" alt="Thumbnail ${index + 1}" style="width:100%;height:100%;object-fit:cover">
      </div>
    `).join('');
  }
  
  // Title and subtitle
  const title = document.getElementById('vehicleDetailTitle');
  const subtitle = document.getElementById('vehicleDetailSubtitle');
  if(title) {
    const displayName = vehicle.make && vehicle.model 
      ? `${vehicle.make} ${vehicle.model} ${vehicle.year || ''}`.trim()
      : vehicle.makeModel || vehicle.name || 'Vehicle';
    title.textContent = displayName;
  }
  if(subtitle) {
    subtitle.textContent = vehicle.trim || vehicle.type || '';
  }
  
  // Rating and reviews
  const rating = document.getElementById('vehicleDetailRating');
  const reviewCount = document.getElementById('vehicleDetailReviewCount');
  const trips = document.getElementById('vehicleDetailTrips');
  
  if(rating) rating.textContent = (vehicle.rating || 5.0).toFixed(1);
  if(reviewCount) reviewCount.textContent = vehicle.reviewCount || 10;
  if(trips) trips.textContent = `${vehicle.tripCount || 52} trips`;
  
  // Quick features
  const seats = document.getElementById('vehicleDetailSeats');
  const transmission = document.getElementById('vehicleDetailTransmission');
  const gas = document.getElementById('vehicleDetailGas');
  const mpg = document.getElementById('vehicleDetailMPG');
  const drivetrain = document.getElementById('vehicleDetailDrivetrain');
  
  if(seats) seats.textContent = `${vehicle.seats || 5} seats`;
  if(transmission) transmission.textContent = vehicle.transmission || 'Automatic';
  if(gas) gas.textContent = vehicle.gasType || 'Regular';
  if(mpg) mpg.textContent = `${vehicle.mpg || 25} MPG`;
  if(drivetrain) {
    const drivetrainText = vehicle.drivetrain || 'FWD';
    drivetrain.querySelector('span').textContent = drivetrainText;
  }
  
  // Host information
  const hostName = document.getElementById('vehicleDetailHostName');
  const hostRating = document.getElementById('vehicleDetailHostRating');
  const hostTrips = document.getElementById('vehicleDetailHostTrips');
  const hostJoinDate = document.getElementById('vehicleDetailHostJoinDate');
  const hostAvatar = document.getElementById('vehicleDetailHostAvatar');
  
  if(vehicle.hostId) {
    try {
      const hostProfile = JSON.parse(localStorage.getItem(HOST_PROFILE_KEY + vehicle.hostId) || '{}');
      if(hostName) hostName.textContent = hostProfile.name || vehicle.hostId.split('@')[0];
      if(hostRating) hostRating.textContent = (hostProfile.rating || 5.0).toFixed(1);
      if(hostTrips) hostTrips.textContent = hostProfile.tripCount || 0;
      
      const joinDate = hostProfile.joinDate ? new Date(hostProfile.joinDate) : new Date();
      if(hostJoinDate) {
        hostJoinDate.textContent = `Joined ${joinDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
      }
      
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
    if(hostJoinDate) hostJoinDate.textContent = 'Joined 2020';
  }
  
  // Description with show more/less
  const description = vehicle.description || 'No description available.';
  const descShort = document.getElementById('vehicleDescriptionShort');
  const descFull = document.getElementById('vehicleDescriptionFull');
  const descToggle = document.getElementById('vehicleDescriptionToggle');
  
  if(description.length > 200) {
    if(descShort) descShort.textContent = description.substring(0, 200) + '...';
    if(descFull) descFull.textContent = description;
    if(descToggle) descToggle.style.display = 'block';
  } else {
    if(descShort) descShort.textContent = description;
    if(descToggle) descToggle.style.display = 'none';
  }
  
  // Distance included
  const mileageIncluded = document.getElementById('vehicleMileageIncluded');
  const mileageOverage = document.getElementById('vehicleMileageOverage');
  if(mileageIncluded) mileageIncluded.textContent = vehicle.mileageIncluded || 600;
  if(mileageOverage) mileageOverage.textContent = (vehicle.mileageOverageRate || 0.19).toFixed(2);
  
  // Cancellation policy
  const cancellationTitle = document.getElementById('vehicleCancellationTitle');
  const cancellationDetails = document.getElementById('vehicleCancellationDetails');
  if(cancellationTitle) cancellationTitle.textContent = vehicle.cancellationPolicy || 'Free cancellation';
  if(cancellationDetails) cancellationDetails.textContent = vehicle.cancellationDetails || 'Full refund within 24 hours of booking';
  
  // Insurance section
  const insuranceSection = document.getElementById('vehicleDetailInsuranceSection');
  if(insuranceSection) {
    if(vehicle.insuranceIncluded) {
      insuranceSection.innerHTML = `
        <div style="padding:24px;background:#e8f5e9;border:1px solid #4caf50;border-radius:12px">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
            <span style="font-size:40px">✓</span>
            <div>
              <div style="font-size:20px;font-weight:700;color:#2e7d32">Insurance Included</div>
              <div style="font-size:15px;color:#666;margin-top:4px">${vehicle.insuranceType || 'Full coverage included'}</div>
            </div>
          </div>
          ${vehicle.insuranceNotes ? `<div style="font-size:14px;color:#666;margin-top:16px;padding-top:16px;border-top:1px solid #c8e6c9;line-height:1.6">${vehicle.insuranceNotes}</div>` : ''}
        </div>
      `;
    } else {
      insuranceSection.innerHTML = `
        <div style="padding:24px;background:#ffebee;border:1px solid #f44336;border-radius:12px">
          <div style="display:flex;align-items:center;gap:16px">
            <span style="font-size:40px">⚠️</span>
            <div>
              <div style="font-size:20px;font-weight:700;color:#c62828">No Insurance Included</div>
              <div style="font-size:15px;color:#666;margin-top:4px">You'll need to provide your own insurance coverage</div>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  // Price
  const price = document.getElementById('vehicleDetailPrice');
  const originalPrice = document.getElementById('vehicleDetailOriginalPrice');
  if(price) price.textContent = vehicle.price || 0;
  
  // Show original price if there's a discount
  if(vehicle.originalPrice && vehicle.originalPrice > vehicle.price) {
    if(originalPrice) {
      originalPrice.textContent = `$${vehicle.originalPrice}`;
      originalPrice.style.display = 'block';
    }
  }
  
  const priceTerm = document.getElementById('vehicleDetailPriceTerm');
  if(priceTerm) {
    const term = vehicle.rentalTerm === 'Weekly' ? 'week' : vehicle.rentalTerm === 'Daily' ? 'day' : 'week';
    priceTerm.textContent = `Total (before taxes)`;
  }
  
  // Location
  const address = document.getElementById('vehicleDetailAddress');
  const locationName = document.getElementById('vehicleLocationName');
  if(address) {
    address.textContent = `${vehicle.address || ''}, ${vehicle.city}, ${vehicle.state} ${vehicle.zip || ''}`.trim();
  }
  if(locationName) {
    locationName.textContent = vehicle.city || 'Pickup Location';
  }
  
  const pickupLocation = document.getElementById('vehicleDetailPickupLocation');
  if(pickupLocation) {
    pickupLocation.textContent = `${vehicle.city}, ${vehicle.state}`;
  }
  
  // Reviews - populate rating bars
  populateRatingBars(vehicle);
  
  // Initialize date inputs
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

// Populate rating bars
function populateRatingBars(vehicle) {
  const ratings = {
    cleanliness: vehicle.ratingCleanliness || 5.0,
    maintenance: vehicle.ratingMaintenance || 5.0,
    communication: vehicle.ratingCommunication || 5.0,
    convenience: vehicle.ratingConvenience || 5.0,
    accuracy: vehicle.ratingAccuracy || 5.0
  };
  
  Object.keys(ratings).forEach(key => {
    const valueEl = document.getElementById(`rating${key.charAt(0).toUpperCase() + key.slice(1)}`);
    const barEl = document.getElementById(`rating${key.charAt(0).toUpperCase() + key.slice(1)}Bar`);
    
    if(valueEl) valueEl.textContent = ratings[key].toFixed(1);
    if(barEl) barEl.style.width = `${(ratings[key] / 5) * 100}%`;
  });
  
  const overallRating = document.getElementById('vehicleOverallRating');
  const totalReviews = document.getElementById('vehicleTotalReviews');
  if(overallRating) overallRating.textContent = (vehicle.rating || 5.0).toFixed(1);
  if(totalReviews) totalReviews.textContent = vehicle.reviewCount || 10;
}

// Update hero image
window.updateVehicleDetailHeroImage = function(imageSrc, index) {
  const heroImg = document.getElementById('vehicleDetailHeroImg');
  if(heroImg) heroImg.src = imageSrc;
  
  // Update thumbnail borders
  const thumbnails = document.querySelectorAll('#vehicleDetailThumbnails > div');
  thumbnails.forEach((thumb, i) => {
    thumb.style.border = i === index ? '2px solid #121214' : '2px solid transparent';
  });
};

// Toggle description
window.toggleDescription = function() {
  const short = document.getElementById('vehicleDescriptionShort');
  const full = document.getElementById('vehicleDescriptionFull');
  const toggle = document.getElementById('vehicleDescriptionToggle');
  
  descriptionExpanded = !descriptionExpanded;
  
  if(descriptionExpanded) {
    if(short) short.style.display = 'none';
    if(full) full.style.display = 'block';
    if(toggle) toggle.textContent = 'Show less';
  } else {
    if(short) short.style.display = 'block';
    if(full) full.style.display = 'none';
    if(toggle) toggle.textContent = 'Show more';
  }
};

// Scroll to reviews section
window.scrollToReviews = function() {
  const reviewsTab = document.querySelector('[data-tab="reviews"]');
  if(reviewsTab) {
    reviewsTab.click();
    setTimeout(() => {
      const reviewsSection = document.getElementById('tab-reviews');
      if(reviewsSection) {
        reviewsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
};

// Scroll to location
window.scrollToLocation = function() {
  const locationTab = document.querySelector('[data-tab="location"]');
  if(locationTab) {
    locationTab.click();
    setTimeout(() => {
      const locationSection = document.getElementById('tab-location');
      if(locationSection) {
        locationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
};

// View host profile
window.viewHostProfile = function() {
  if(currentVehicleDetails && currentVehicleDetails.hostId) {
    showToast('Host profile feature coming soon');
  }
};

// Load more reviews
window.loadMoreReviews = function() {
  showToast('Loading more reviews...');
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

// Update pricing calculations
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
    document.getElementById('vehicleDetailServiceFee').textContent = '$0.00';
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
    const weeks = Math.ceil(days / 7);
    total = price * weeks;
  }
  
  // Calculate service fee (e.g., 10%)
  const serviceFee = total * 0.10;
  const grandTotal = total + serviceFee;
  
  // Show discount if applicable (3+ day discount)
  const savingsEl = document.getElementById('vehicleTripSavings');
  if(days >= 3 && savingsEl) {
    const discount = total * 0.05; // 5% discount
    document.getElementById('vehicleSavingsAmount').textContent = discount.toFixed(2);
    savingsEl.style.display = 'block';
    total -= discount;
  } else if(savingsEl) {
    savingsEl.style.display = 'none';
  }
  
  document.getElementById('vehicleDetailTripPrice').textContent = `$${total.toFixed(2)}`;
  document.getElementById('vehicleDetailServiceFee').textContent = `$${serviceFee.toFixed(2)}`;
  document.getElementById('vehicleDetailTotal').textContent = `$${(total + serviceFee).toFixed(2)}`;
}

// Lightbox gallery functions
window.openVehicleGalleryLightbox = function(startIndex = 0) {
  if(!lightboxImages || lightboxImages.length === 0) {
    showToast('No images available');
    return;
  }
  
  currentLightboxIndex = startIndex;
  const lightbox = document.getElementById('vehicleGalleryLightbox');
  if(lightbox) {
    lightbox.style.display = 'block';
    updateLightboxImage();
    document.body.style.overflow = 'hidden';
  }
};

window.closeVehicleGalleryLightbox = function() {
  const lightbox = document.getElementById('vehicleGalleryLightbox');
  if(lightbox) {
    lightbox.style.display = 'none';
    document.body.style.overflow = '';
  }
};

window.lightboxNavigate = function(direction) {
  currentLightboxIndex += direction;
  if(currentLightboxIndex < 0) currentLightboxIndex = lightboxImages.length - 1;
  if(currentLightboxIndex >= lightboxImages.length) currentLightboxIndex = 0;
  updateLightboxImage();
};

function updateLightboxImage() {
  const img = document.getElementById('lightboxImage');
  const counter = document.getElementById('lightboxCounter');
  
  if(img && lightboxImages[currentLightboxIndex]) {
    img.src = lightboxImages[currentLightboxIndex];
  }
  
  if(counter) {
    counter.textContent = `${currentLightboxIndex + 1} / ${lightboxImages.length}`;
  }
}

// Keyboard navigation for lightbox
document.addEventListener('keydown', (e) => {
  const lightbox = document.getElementById('vehicleGalleryLightbox');
  if(lightbox && lightbox.style.display === 'block') {
    if(e.key === 'Escape') closeVehicleGalleryLightbox();
    if(e.key === 'ArrowLeft') lightboxNavigate(-1);
    if(e.key === 'ArrowRight') lightboxNavigate(1);
  }
});

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

// Handle Continue button
document.addEventListener('click', (e) => {
  if(e.target.id === 'vehicleDetailBookBtn') {
    if(!currentVehicleDetails) {
      showToast('Vehicle information not available');
      return;
    }
    
    // Check if user is logged in
    const email = getSessionEmail();
    if(!email) {
      showToast('Please log in to continue');
      goto('login');
      return;
    }
    
    // Store booking data
    sessionStorage.setItem('selectedVehicle', JSON.stringify(currentVehicleDetails));
    sessionStorage.setItem('pickupDate', document.getElementById('detailPickupDate').value);
    sessionStorage.setItem('returnDate', document.getElementById('detailReturnDate').value);
    
    goto('booking');
    
    // Pre-populate booking form
    setTimeout(() => {
      const vehicleSelect = document.getElementById('vehicle-select');
      if(vehicleSelect) {
        for(let i = 0; i < vehicleSelect.options.length; i++) {
          if(vehicleSelect.options[i].value === currentVehicleDetails.id) {
            vehicleSelect.selectedIndex = i;
            break;
          }
        }
      }
      
      const pickupDateInput = document.getElementById('pickupDate');
      const pickup = document.getElementById('detailPickupDate').value;
      if(pickupDateInput && pickup) {
        pickupDateInput.value = pickup.split('T')[0];
      }
    }, 100);
  }
});

// Update vehicle grid to show details on click
document.addEventListener('click', (e) => {
  const vehicleCard = e.target.closest('[data-vehicle-id]');
  if(vehicleCard && !e.target.closest('button') && !e.target.hasAttribute('data-nav') && !e.target.classList.contains('navbtn')) {
    const vehicleId = vehicleCard.getAttribute('data-vehicle-id');
    if(vehicleId) {
      showVehicleDetails(vehicleId);
    }
  }
});
