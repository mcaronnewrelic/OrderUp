import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../services/restaurant.service';
import { CustomerService } from '../../services/customer.service';
import { Restaurant } from '../../models/restaurant.model';
import { CustomerCardComponent } from '../customer-card/customer-card';
import { HeaderComponent } from '../header/header';
import { NrCalloutComponent } from '../nr-callout/nr-callout';
import { NrCheckComponent } from '../nr-check/nr-check';
import { MissionProgressService } from '../../services/mission-progress.service';
import { OrderStepsComponent } from '../order-steps/order-steps';
import { FunnelService } from '../../services/funnel.service';

@Component({
  selector: 'app-restaurants',
  imports: [CommonModule, RouterModule, FormsModule, CustomerCardComponent, HeaderComponent, NrCalloutComponent, NrCheckComponent, OrderStepsComponent],
  templateUrl: './restaurants.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './restaurants.css'
})
export class RestaurantsComponent implements OnInit {
  readonly listNrql =
    "SELECT count(*), average(duration), percentile(duration, 95) FROM Transaction WHERE appName = 'OrderUp' AND name = 'WebTransaction/Expressjs/GET//api/restaurant' SINCE 1 day ago";
  readonly clicksNrql =
    "SELECT timestamp, actionName, filterType, filterValue, resultCount, restaurant, item FROM PageAction WHERE appName = 'OrderUp' AND funnel = 'ordering' AND demoCode = '<code>' SINCE 1 hour ago";
  readonly menuStatusNrql =
    "SELECT count(*) FROM Transaction WHERE appName = 'OrderUp' AND name = 'WebTransaction/Expressjs/GET//api/restaurant/by-name/:name' FACET request.uri, http.statusCode SINCE 1 day ago";
  readonly menuNrql =
    "SELECT count(*), average(duration) FROM Transaction WHERE appName = 'OrderUp' AND name = 'WebTransaction/Expressjs/GET//api/restaurant/by-name/:name' FACET request.uri SINCE 1 day ago";

  allRestaurants = signal<Restaurant[]>([]);
  
  // Add collapsible state for filters
  filtersCollapsed = signal(true);
  
  filter = signal({
    cuisine: [] as string[],
    price: null as number | null,
    rating: null as number | null,
    sortBy: 'name',
    sortAsc: true
  });

  filteredRestaurants = computed(() => {
    const restaurants = this.allRestaurants();
    const currentFilter = this.filter();
    
    return restaurants
      .filter(restaurant => {
        if (currentFilter.price && currentFilter.price !== restaurant.price) {
          return false;
        }
        if (currentFilter.rating && currentFilter.rating !== restaurant.rating) {
          return false;
        }
        if (currentFilter.cuisine.length && !currentFilter.cuisine.includes(restaurant.cuisine)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aVal = (a as any)[currentFilter.sortBy];
        const bVal = (b as any)[currentFilter.sortBy];
        
        if (aVal > bVal) return currentFilter.sortAsc ? 1 : -1;
        if (aVal < bVal) return currentFilter.sortAsc ? -1 : 1;
        return 0;
      });
  });

  /**
   * Cuisine chips come from the restaurants actually loaded, most common
   * first, so a chip can never filter down to nothing.
   */
  cuisineOptions = computed(() => {
    const counts = new Map<string, number>();
    for (const restaurant of this.allRestaurants()) {
      if (!restaurant.cuisine) continue;
      counts.set(restaurant.cuisine, (counts.get(restaurant.cuisine) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, label: this.getCuisineName(key) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });

  constructor(
    private restaurantService: RestaurantService,
    private customerService: CustomerService,
    private router: Router
  ) {}

  ngOnInit() {
    if (!this.customerService.address) {
      this.router.navigate(['/customer']);
      return;
    }

    this.restaurantService.getRestaurants().subscribe(restaurants => {
      this.allRestaurants.set(restaurants);
      this.funnel.track('restaurants_viewed', { resultCount: restaurants.length });
    });
  }

  private progress = inject(MissionProgressService);
  private funnel = inject(FunnelService);

  updateFilter(key: string, value: any) {
    this.progress.markTried('mission-2');
    this.filter.update(current => ({ ...current, [key]: value }));
    this.trackFilter(key, value === null || value === '' ? 'any' : String(value));
  }

  /** Filtering is client-side, so this PageAction is its only telemetry. */
  private trackFilter(filterType: string, filterValue: string, selected = true) {
    this.funnel.track('restaurant_filter_applied', {
      filterType,
      filterValue,
      selected,
      resultCount: this.filteredRestaurants().length,
    });
  }

  toggleCuisine(cuisine: string) {
    this.progress.markTried('mission-2');
    this.filter.update(current => {
      const newCuisines = current.cuisine.includes(cuisine)
        ? current.cuisine.filter(c => c !== cuisine)
        : [...current.cuisine, cuisine];
      return { ...current, cuisine: newCuisines };
    });
    this.trackFilter('cuisine', cuisine, this.filter().cuisine.includes(cuisine));
  }

  getCuisineKeys() {
    return this.cuisineOptions().map((option) => option.key);
  }

  /** "czech/slovak" -> "Czech/Slovak" */
  getCuisineName(cuisine: string) {
    return cuisine.replace(/(^|[\s/-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
  }

  toggleFilters() {
    this.filtersCollapsed.update(collapsed => !collapsed);
  }

  getStarArray(count: number) {
    return new Array(Math.floor(count));
  }

  getEmptyStarArray(count: number) {
    return new Array(Math.floor(count));
  }

  getFilledStars(rating: number) {
    return '\u2605'.repeat(Math.floor(rating));
  }

  getEmptyStars(rating: number) {
    return '\u2606'.repeat(5 - Math.floor(rating));
  }

  getDollarSigns(price: number) {
    return '$'.repeat(price);
  }

  viewMenu(restaurant: Restaurant) {
    const nameSlug = this.restaurantService.getRestaurantSlug(restaurant);
    this.router.navigate(['/menu', nameSlug]);
  }

  // Expose customer data for the customer card
  get customer() {
    return this.customerService.customer();
  }

  // Make Object available in template
  Object = Object;
}
